import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0 && existing[0]) return existing[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  // 로컬 개발용 폴백 (serviceAccountKey.json 은 gitignore 처리됨, Vercel에는 없음)
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

  throw new Error("FCM 관리자 자격증명이 없습니다 (환경변수 또는 serviceAccountKey.json 필요)");
}

async function requireOwner(req: Request): Promise<string> {
  const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!idToken) throw new Error("로그인이 필요합니다");
  const app = getAdminApp();
  const decoded = await getAuth(app).verifyIdToken(idToken);
  const snap = await getFirestore(app).doc(`users/${decoded.uid}`).get();
  if (snap.data()?.perm !== "owner") throw new Error("최고관리자만 발송할 수 있습니다");
  return decoded.uid;
}

interface PushBody {
  title?: string;
  body?: string;
  token?: string;
}

// POST /api/push/send { title, body, token? }
// token이 없으면 fcmTokens 전체에 발송한다. 최고관리자(owner)만 호출 가능.
export async function POST(req: Request) {
  try {
    await requireOwner(req);
    const { title, body, token } = (await req.json()) as PushBody;
    if (!title || !body) {
      return Response.json({ ok: false, error: "title, body가 필요합니다" }, { status: 400 });
    }

    const app = getAdminApp();
    if (token) {
      await getMessaging(app).send({
        token,
        notification: { title, body },
        webpush: { fcmOptions: { link: "/" } },
      });
      return Response.json({ ok: true, sent: 1 });
    }

    const snap = await getFirestore(app).collection("fcmTokens").get();
    const tokens = snap.docs
      .map((d) => (d.data() as { token?: string }).token)
      .filter((t): t is string => !!t);
    if (tokens.length === 0) return Response.json({ ok: true, sent: 0 });

    let sent = 0;
    for (let i = 0; i < tokens.length; i += 500) {
      const res = await getMessaging(app).sendEachForMulticast({
        tokens: tokens.slice(i, i + 500),
        notification: { title, body },
        webpush: { fcmOptions: { link: "/" } },
      });
      sent += res.successCount;
    }
    return Response.json({ ok: true, sent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "발송 실패";
    const status = message.includes("관리자") || message.includes("로그인") ? 403 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
