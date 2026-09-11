"use client";

import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
} from "firebase/messaging";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { app, auth, db } from "@/lib/firebase";

export type FcmStatus =
  | "idle"
  | "unsupported"
  | "denied"
  | "no-vapid-key"
  | "error"
  | "granted";

export interface ForegroundPush {
  title: string;
  body: string;
}

// 알림 허용 → FCM 토큰 발급 → Firestore fcmTokens에 저장.
// iOS는 홈 화면에 추가한 PWA에서 사용자 제스처(버튼)로 호출해야 권한 팝업이 뜬다.
export async function requestFcmPermission(
  onForeground?: (msg: ForegroundPush) => void
): Promise<{ status: FcmStatus; token: string | null }> {
  if (!(await isSupported())) return { status: "unsupported", token: null };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { status: "denied", token: null };

  const vapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;
  if (!vapidKey) return { status: "no-vapid-key", token: null };

  try {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey });
    if (!token) return { status: "error", token: null };

    await setDoc(doc(db, "fcmTokens", token), {
      token,
      uid: auth.currentUser?.uid || null,
      platform: navigator.userAgent,
      updatedAt: serverTimestamp(),
    });

    onMessage(messaging, (payload: MessagePayload) => {
      onForeground?.({
        title: payload.notification?.title || "강원대분회",
        body: payload.notification?.body || "",
      });
    });

    return { status: "granted", token };
  } catch (e) {
    console.error("[fcm] 토큰 발급 실패", e);
    return { status: "error", token: null };
  }
}
