// scripts/gen-fcm-sw.mjs
// .env.local(NEXT_PUBLIC_FIREBASE_*) 값을 읽어 public/firebase-messaging-sw.js 를 생성한다.
// 서비스워커는 정적 파일이라 process.env 를 직접 쓸 수 없기 때문에 빌드/개발 시작 전에 값을 박아 넣는다.
// predev / prebuild 훅에서 자동 실행된다.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnvLocal() {
  const out = {};
  const p = join(root, ".env.local");
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const fileEnv = loadDotEnvLocal();
const pick = (k) => process.env[k] || fileEnv[k] || "";

const config = {
  apiKey: pick("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: pick("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: pick("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  messagingSenderId: pick("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: pick("NEXT_PUBLIC_FIREBASE_APP_ID"),
};

const missing = Object.entries(config)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length > 0) {
  console.warn(`[gen-fcm-sw] Firebase 웹 설정이 비어 있음: ${missing.join(", ")}`);
}

const sw = `importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(config, null, 2)});

const messaging = firebase.messaging();

// 설치 가능 판정용 no-op fetch 핸들러 (응답에 개입하지 않음)
self.addEventListener('fetch', () => {});

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || '강원대분회';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  };
  self.registration.showNotification(title, options);
});
`;

writeFileSync(join(root, "public", "firebase-messaging-sw.js"), sw);
console.log("[gen-fcm-sw] public/firebase-messaging-sw.js 생성 완료");
