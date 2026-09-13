import type { App } from "firebase-admin/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// firebase-admin은 정적 import하지 않는다.
// Next가 external 패키지를 require()로 로드하면 의존성 체인(jwks-rsa → ESM 전용 jose)이
// ERR_REQUIRE_ESM으로 깨진다. 함수 안에서 동적 import()하면 Node ESM 로더를 타서 정상 동작한다.
async function getAdminApp(): Promise<App> {
  const { getApps, initializeApp, cert } = await import("firebase-admin/app");
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = rawPrivateKey?.replace(/\\n/g, "\n");

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  try {
    const { existsSync, readFileSync } = (await import("node:fs")) as typeof import("node:fs");
    const { join } = (await import("node:path")) as typeof import("node:path");
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
  } catch {}

  throw new Error("FCM 관리자 자격증명이 없습니다");
}

async function requireOwner(req: Request): Promise<string> {
  const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!idToken) throw new Error("로그인이 필요합니다");
  const app = await getAdminApp();
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore } = await import("firebase-admin/firestore");
  const decoded = await getAuth(app).verifyIdToken(idToken);
  const snap = await getFirestore(app).doc(`users/${decoded.uid}`).get();
  if (snap.data()?.perm !== "owner") throw new Error("최고관리자만 발송할 수 있습니다");
  return decoded.uid;
}

export async function GET() {
  return Response.json({ ok: false, error: "Method not allowed, use POST" }, { status: 405 });
}

export async function POST(req: Request) {
  try {
    await requireOwner(req);
    const { title, body, token } = (await req.json()) as {
      title?: string;
      body?: string;
      token?: string;
    };
    if (!title || !body) {
      return Response.json({ ok: false, error: "title, body가 필요합니다" }, { status: 400 });
    }
    const app = await getAdminApp();
    const { getFirestore } = await import("firebase-admin/firestore");
    const { getMessaging } = await import("firebase-admin/messaging");
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
      .map((d) => (d.data() as { token?: unknown }).token)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
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
            code.includes("invalid-argument"))
        ) {
          try {
            await db.collection("fcmTokens").doc(batch[j]).delete();
            cleaned++;
          } catch {}
        }
      }
    }
    return Response.json({ ok: true, sent, cleaned });
  } catch (e) {
    console.error("[push/send] error:", e);
    const message = e instanceof Error ? e.message : "발송 실패";
    const status = message.includes("관리자") || message.includes("로그인") ? 403 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
