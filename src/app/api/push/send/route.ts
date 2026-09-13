import { initializeApp, getApps, cert, type App } from "firebase-admin/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId ||!clientEmail ||!privateKey) {
    throw new Error("FCM 관리자 자격증명이 없습니다: ENV 확인");
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

async function requireOwner(req: Request) {
  const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!idToken) throw new Error("로그인이 필요합니다");
  const app = getAdminApp();
  const { getAuth } = await import("firebase-admin/auth");
  const { getFirestore } = await import("firebase-admin/firestore");
  const decoded = await getAuth(app).verifyIdToken(idToken);
  const snap = await getFirestore(app).doc(`users/${decoded.uid}`).get();
  if (snap.data()?.perm!== "owner") throw new Error("최고관리자만 발송할 수 있습니다");
  return decoded.uid;
}

export async function GET() {
  return Response.json({ ok: false, error: "Method not allowed, use POST" }, { status: 405 });
}

export async function POST(req: Request) {
  try {
    await requireOwner(req);
    const { title, body, token } = (await req.json()) as { title?: string; body?: string; token?: string };
    if (!title ||!body) {
      return Response.json({ ok: false, error: "title, body가 필요합니다" }, { status: 400 });
    }
    const app = getAdminApp();
    const { getFirestore } = await import("firebase-admin/firestore");
    const { getMessaging } = await import("firebase-admin/messaging");
    const db = getFirestore(app);

    if (token) {
      await getMessaging(app).send({ token, notification: { title, body }, webpush: { fcmOptions: { link: "/" } } });
      return Response.json({ ok: true, sent: 1 });
    }

    const snap = await db.collection("fcmTokens").get();
    const tokens = snap.docs.map((d) => (d.data() as any).token).filter((t: any): t is string =>!!t);
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
        const r = res.responses[j];
        if (!r?.success && (r.error?.code?.includes("not-registered") || r.error?.code?.includes("invalid-argument"))) {
          try { await db.collection("fcmTokens").doc(batch[j]).delete(); cleaned++; } catch {}
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