import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cachedKeys: { keys: Record<string, string>; exp: number } | null = null;

function getAdminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId ||!clientEmail ||!privateKey) throw new Error("FCM ENV 없음");
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

async function getGoogleKeys(): Promise<Record<string, string>> {
  if (cachedKeys && Date.now() < cachedKeys.exp) return cachedKeys.keys;
  const res = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  const keys = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
  cachedKeys = { keys, exp: Date.now() + maxAge * 1000 };
  return keys;
}

async function verifyIdTokenDirect(idToken: string): Promise<{ uid: string }> {
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const keys = await getGoogleKeys();
  const decodedHeader = jwt.decode(idToken, { complete: true }) as any;
  const kid = decodedHeader?.header?.kid;
  if (!kid ||!keys[kid]) throw new Error("Invalid token kid");

  const payload = jwt.verify(idToken, keys[kid], {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  }) as any;

  return { uid: payload.uid || payload.sub };
}

async function requireOwner(req: Request) {
  const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!idToken) throw new Error("로그인이 필요합니다");
  const { uid } = await verifyIdTokenDirect(idToken);
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = getAdminApp();
  const snap = await getFirestore(app).doc(`users/${uid}`).get();
  if (snap.data()?.perm!== "owner") throw new Error("최고관리자만 발송할 수 있습니다");
  return uid;
}

export async function POST(req: Request) {
  try {
    await requireOwner(req);
    const { title, body, token } = (await req.json()) as { title?: string; body?: string; token?: string };
    if (!title ||!body) return Response.json({ ok: false, error: "title, body 필요" }, { status: 400 });

    const app = getAdminApp();
    const { getFirestore } = await import("firebase-admin/firestore");
    const { getMessaging } = await import("firebase-admin/messaging");
    const db = getFirestore(app);

    if (token) {
      await getMessaging(app).send({ token, notification: { title, body } });
      return Response.json({ ok: true, sent: 1 });
    }

    const snap = await db.collection("fcmTokens").get();
    const tokens = snap.docs.map(d => (d.data() as any).token).filter((t: any) =>!!t);
    if (tokens.length === 0) return Response.json({ ok: true, sent: 0 });

    let sent = 0;
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const res = await getMessaging(app).sendEachForMulticast({ tokens: batch, notification: { title, body } });
      sent += res.successCount;
    }
    return Response.json({ ok: true, sent });
  } catch (e) {
    console.error("[push/send] error:", e);
    const msg = e instanceof Error? e.message : "발송 실패";
    const status = msg.includes("관리자") || msg.includes("로그인")? 403 : 500;
    return Response.json({ ok: false, error: msg }, { status });
  }
}

export async function GET() {
  return Response.json({ ok: false, error: "Use POST" }, { status: 405 });
}