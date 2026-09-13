import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Vercel에서 \n이 문자로 저장되는 문제 해결
  const privateKey = rawPrivateKey?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  // 로컬 개발용 폴백 - 프로덕션에서는 실행 안되도록 try-catch로 감쌈
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync, readFileSync } = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require("node:path") as typeof import("node:path");

    const keyPath = join(process.cwd(), "serviceAccountKey.json");
    if (existsSync(keyPath)) {
      const key = JSON.parse(readFileSync(keyPath, "utf8")) as {
        project_id: string;
        client_email: string;
        private_key: string;
      };
      return initializeApp({
        credential: cert({
          projectId: key.project_id,
          clientEmail: key.client_email,
          privateKey: key.private_key,
        }),
      });
    }
  } catch {
    // Vercel에서는 serviceAccountKey.json이 없으니 무시
  }

  throw new Error(
    "FCM 관리자 자격증명이 없습니다 (FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY 환경변수 필요)"
  );
}

async function requireOwner(req: Request): Promise<string> {
  const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!idToken) throw new Error("로그인이 필요합니다");
  const app = getAdminApp();
  const decoded = await getAuth(app).verifyIdToken(idToken);
  const snap = await getFirestore(app).doc(`users/${decoded.uid}`).get();
  if (snap.data()?.perm!== "owner") throw new Error("최고관리자만 발송할 수 있습니다");
  return decoded.uid;
}

interface PushBody {
  title?: string;
  body?: string;
  token?: string;
}

export async function GET() {
  return Response.json({ ok: false, error: "Method not allowed, use POST" }, { status: 405 });
}

// POST /api/push/send { title, body, token? }
export async function POST(req: Request) {
  try {
    await requireOwner(req);
    const { title, body, token } = (await req.json()) as PushBody;
    if (!title ||!body) {
      return Response.json({ ok: false, error: "title, body가 필요합니다" }, { status: 400 });
    }

    const app = getAdminApp();
    const db = getFirestore(app);

    if (token) {
      await getMessaging(app).send({
        token,
        notification: { title, body },
        webpush: { fcmOptions: { link: "/" } },
      });
      return Response.json({ ok: true, sent: 1 });
    }

    const snap = await db.collection("fcmTokens").get();
    const tokens = snap.docs
     .map((d) => (d.data() as { token?: string }).token)
     .filter((t): t is string =>!!t);

    if (tokens.length === 0) return Response.json({ ok: true, sent: 0 });

    let sent = 0;
    let cleaned = 0;

    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const res = await getMessaging(app).sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        webpush: { fcmOptions: { link: "/" } },
      });
      sent += res.successCount;

      for (let j = 0; j < batch.length; j++) {
        const resp = res.responses[j];
        const code = resp?.error?.code || "";
        if (
         !resp?.success &&
          (code.includes("registration-token-not-registered") ||
            code.includes("invalid-argument") ||
            code.includes("not-registered"))
        ) {
          const dead = batch[j];
          try {
            await db.collection("fcmTokens").doc(dead).delete();
            cleaned++;
          } catch {
            // 정리 실패는 무시
          }
        }
      }
    }
    return Response.json({ ok: true, sent, cleaned });
  } catch (e) {
    console.error("[push/send] error:", e);
    const message = e instanceof Error? e.message : "발송 실패";
    const status = message.includes("관리자") || message.includes("로그인")? 403 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}