"use client";

import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
} from "firebase/messaging";
import { doc, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore";
import { app, auth, db } from "@/lib/firebase";

const TOKEN_STORAGE_KEY = "kipu-fcm-token";

// User-Agent 원문 대신 저장하는 짧은 단말 구분값 (개인정보 최소화)
function platformLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "기타";
}

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
      platform: platformLabel(),
      updatedAt: serverTimestamp(),
    });
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      // 저장소 미지원 환경에서는 무시 (토큰 문서는 이미 저장됨)
    }

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

// 로그아웃 시 이 기기의 토큰 문서를 정리한다.
// 실패해도 로그아웃 자체는 막지 않는다.
export async function unregisterFcmToken(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return;
  }
  if (!token) return;
  try {
    await deleteDoc(doc(db, "fcmTokens", token));
  } catch (e) {
    console.warn("[fcm] 토큰 정리 실패", e);
  }
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // 무시
  }
}
