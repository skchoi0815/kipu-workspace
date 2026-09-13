"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { normalizeEmail, resolveProfile } from "@/lib/profiles";
import CalendarView from "@/components/CalendarView";
import BoardView from "@/components/BoardView";
import LibraryView from "@/components/LibraryView";
import EventsView from "@/components/EventsView";
import RosterTable from "@/components/RosterTable";
import ChatBox from "@/components/ChatBox";
import HomeDashboard from "@/components/HomeDashboard";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { requestFcmPermission, unregisterFcmToken, type FcmStatus, type ForegroundPush } from "@/hooks/useFcm";

const TAB_IDS = ["home", "cal", "board", "lib", "events", "chat", "roster", "admin"];

function initialTab(): string {
  if (typeof window === "undefined") return "home";
  const t = new URLSearchParams(window.location.search).get("tab");
  return t && TAB_IDS.includes(t) ? t : "home";
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  perm: "owner" | "member";
  status: "active" | "blocked" | "pending";
  phone: string;
}

export default function WorkspacePage() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  const changeTab = (id: string) => {
    setActiveTab(id);
    window.history.replaceState(null, "", id === "home" ? "/" : `/?tab=${id}`);
  };
  const [profileError, setProfileError] = useState("");
  const [fcmStatus, setFcmStatus] = useState<FcmStatus>("idle");
  const [fcmMsg, setFcmMsg] = useState<ForegroundPush | null>(null);
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [sendResult, setSendResult] = useState("");

  const handleFcm = async () => {
    const { status } = await requestFcmPermission(setFcmMsg);
    setFcmStatus(status);
  };

  const handleSendPush = async () => {
    setSendResult("");
    if (!pushTitle.trim() || !pushBody.trim()) {
      setSendResult("제목과 내용을 입력해 주세요.");
      return;
    }
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ title: pushTitle.trim(), body: pushBody.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setSendResult(
          `${data.sent}대에 발송했습니다.` +
            (data.cleaned > 0 ? ` (만료 토큰 ${data.cleaned}건 정리)` : "")
        );
        setPushTitle("");
        setPushBody("");
      } else {
        setSendResult(`발송 실패: ${data.error}`);
      }
    } catch {
      setSendResult("발송 중 오류가 발생했습니다.");
    }
  };

  // Firebase 인증 상태 감시 및 프로필 동기화
  // - 알려진 집행위원 이메일이면 매핑 기준으로 생성/교정한다
  // - 모르는 계정은 승인대기로 만들고, 조회 실패 시 오류 화면을 보여준다
  // - 어떤 경우에도 가짜 owner 프로필을 씌우지 않는다
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setCurrentUser(null);
        setProfileError("");
        setLoading(false);
        return;
      }
      try {
        setProfileError("");
        const ref = doc(db, "users", fbUser.uid);
        const snap = await getDoc(ref);
        const { action, profile } = resolveProfile(
          normalizeEmail(fbUser.email),
          snap.exists(),
          snap.exists() ? (snap.data() as UserProfile) : null
        );
        if (action === "use-existing") {
          setCurrentUser({ ...profile, id: fbUser.uid });
        } else if (action === "heal") {
          await setDoc(ref, profile, { merge: true });
          setCurrentUser({ ...profile, id: fbUser.uid });
        } else {
          await setDoc(ref, profile);
          setCurrentUser({ ...profile, id: fbUser.uid });
        }
      } catch (error) {
        console.error("프로필 조회 실패:", error);
        setCurrentUser(null);
        setProfileError("프로필을 불러오지 못했습니다. 네트워크 또는 권한 설정을 확인해 주세요.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: unknown) {
      console.error(err);
      setLoginError("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  const handleLogout = () => {
    unregisterFcmToken().finally(() => {
      signOut(auth);
    });
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F4F6FA] text-[#6C7787] text-sm">
        시스템 연결 중…
      </div>
    );
  }

  // 1-1. 프로필 조회 실패 화면 (가짜 프로필을 씌우지 않는다)
  if (profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-[#F4F6FA]">
        <div className="w-full max-w-md rounded-xl border border-[#DFE4EC] bg-white p-8 shadow-sm text-center">
          <p className="text-sm font-bold text-[#111823] mb-2">접속 오류</p>
          <p className="text-xs text-[#6C7787] mb-6">{profileError}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#BF3329] text-white font-semibold rounded text-sm hover:bg-[#96271F] transition"
            >
              다시 시도
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-[#C6CEDA] text-[#3B4653] font-semibold rounded text-sm hover:bg-[#F4F6FA] transition"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 1. 로그인 화면
  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-[#F4F6FA]">
        <div className="w-full max-w-md rounded-xl border border-[#DFE4EC] bg-white p-8 shadow-sm">
          <Image
            src="/union-logo.png"
            alt="한국비정규교수노동조합 로고"
            width={200}
            height={144}
            className="mb-4 h-auto"
            priority
          />
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1 h-6 bg-[#BF3329] rounded-sm"></span>
            <h1 className="text-lg font-bold text-[#111823]">한국비정규교수노동조합 강원대분회</h1>
          </div>
          <p className="text-xs text-[#6C7787] mb-6">집행부 전용 업무 공간입니다.</p>

          {loginError && (
            <div className="p-3 mb-4 rounded bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-[#6C7787]">이메일</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA] bg-white text-sm focus:outline-[#BF3329]"
                placeholder="이메일을 입력하세요"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#6C7787]">비밀번호</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA] bg-white text-sm focus:outline-[#BF3329]"
                placeholder="비밀번호"
                required
              />
            </div>
            <button 
              type="submit" 
              className="w-full py-2.5 mt-2 bg-[#BF3329] text-white font-semibold rounded text-sm hover:bg-[#96271F] transition"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 1-2. 승인대기/차단 화면 (메인 UI 진입 차단)
  if (currentUser.status !== "active") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-[#F4F6FA]">
        <div className="w-full max-w-md rounded-xl border border-[#DFE4EC] bg-white p-8 shadow-sm text-center">
          <p className="text-sm font-bold text-[#111823] mb-2">
            {currentUser.status === "pending" ? "승인 대기 중입니다" : "이용이 제한된 계정입니다"}
          </p>
          <p className="text-xs text-[#6C7787] mb-6">
            {currentUser.status === "pending"
              ? `등록되지 않은 계정(${currentUser.email})입니다. 분회장에게 승인을 요청해 주세요.`
              : "관리자에게 문의해 주세요."}
          </p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 border border-[#C6CEDA] text-[#3B4653] font-semibold rounded text-sm hover:bg-[#F4F6FA] transition"
          >
            로그아웃
          </button>
        </div>
      </div>
    );
  }

  // 2. 메인 대시보드 화면
  const canEditRoster = 
    currentUser.perm === "owner" || 
    currentUser.role === "분회장" || 
    currentUser.role === "사무국장" || 
    currentUser.role === "조직국장";

  return (
    <ConfirmProvider>
    <div className="min-h-screen flex flex-col bg-[#F4F6FA]">
      {/* 최상단 상태 밴드 */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-[#111823] text-white text-xs">
        <div className="flex items-center gap-2">
          <span>
            <b>{currentUser.name}</b> ({currentUser.role}) · {currentUser.perm === "owner" ? "최고관리자" : "집행위원"}
          </span>
        </div>
        <button 
          onClick={handleLogout} 
          className="border border-white/30 px-2 py-0.5 rounded-full hover:bg-white/10 transition"
        >
          로그아웃
        </button>
      </div>

      {/* 2단 레이아웃 (사이드바 + 본문) */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[240px_1fr]">
        <aside className="border-r border-[#DFE4EC] bg-white p-4 flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <Image
              src="/union-emblem.png"
              alt="한국비정규교수노동조합 엠블럼"
              width={40}
              height={40}
              className="h-8 w-8 object-contain"
            />
            <span className="font-bold text-sm text-[#111823]">강원대분회 업무 공간</span>
          </div>
          <nav className="flex flex-col gap-1 text-sm">
            {[
              { id: "home", label: "◈ 현황" },
              { id: "cal", label: "▦ 일정" },
              { id: "board", label: "✎ 공지사항" },
              { id: "lib", label: "▤ 자료실" },
              { id: "events", label: "✦ 행사" },
              { id: "chat", label: "✉ 채팅" },
              { id: "roster", label: "❖ 조합원 명부" },
              { id: "admin", label: "⚙ 관리" }
            ].map((menu) => (
              <button
                key={menu.id}
                onClick={() => changeTab(menu.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded text-left transition ${
                  activeTab === menu.id 
                    ? "bg-[#EDF0F6] font-bold text-[#111823]" 
                    : "hover:bg-[#F4F6FA] text-[#3B4653]"
                }`}
              >
                {menu.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="p-6">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-[#111823]">
              {activeTab === "home" && "집행부 현황"}
              {activeTab === "cal" && "일정"}
              {activeTab === "board" && "공지사항"}
              {activeTab === "lib" && "자료실"}
              {activeTab === "events" && "행사 관리"}
              {activeTab === "chat" && "집행부 채팅"}
              {activeTab === "roster" && "조합원 명부"}
              {activeTab === "admin" && "관리"}
            </h2>
          </div>

          {activeTab === "home" && <HomeDashboard onGoTab={changeTab} />}

          {activeTab === "cal" && <CalendarView />}
          {activeTab === "board" && (
            <BoardView 
              currentUserName={currentUser?.name || "관리자"} 
              currentUserId={currentUser?.id || "admin"} 
            />
          )}
          {activeTab === "lib" && <LibraryView currentRole={currentUser.role} />}
          {activeTab === "events" && <EventsView currentRole={currentUser.role} />}
          {activeTab === "roster" && <RosterTable canEdit={canEditRoster} />}
          {activeTab === "chat" && (
            <ChatBox 
              currentUserName={currentUser.name} 
              currentUserId={currentUser.id} 
            />
          )}

          {activeTab === "admin" && (
            <div className="flex flex-col gap-4">
              <div className="bg-white border border-[#DFE4EC] rounded-lg p-6 shadow-sm">
                <p className="text-sm text-[#6C7787]">관리자 전용 설정 영역입니다.</p>
              </div>
              <div className="bg-white border border-[#DFE4EC] rounded-lg p-6 shadow-sm">
                <p className="text-sm font-bold text-[#111823] mb-1">푸시 알림</p>
                <p className="text-xs text-[#6C7787] mb-4">
                  {fcmStatus === "granted" && "알림 허용됨 · 토큰 저장 완료"}
                  {fcmStatus === "idle" && "아직 허용하지 않았습니다."}
                  {fcmStatus === "unsupported" && "이 브라우저는 푸시를 지원하지 않습니다."}
                  {fcmStatus === "denied" && "알림이 차단됨 — 브라우저/OS 설정에서 허용해 주세요."}
                  {fcmStatus === "no-vapid-key" && "VAPID 키 미설정 — 관리자에게 문의하세요."}
                  {fcmStatus === "error" && "토큰 발급 실패 — 다시 시도해 주세요."}
                </p>
                <button
                  onClick={handleFcm}
                  className="px-4 py-2 bg-[#BF3329] text-white font-semibold rounded text-sm hover:bg-[#96271F] transition"
                >
                  알림 허용하기
                </button>
                <p className="text-xs text-[#6C7787] mt-3">
                  아이폰은 홈 화면에 추가한 앱에서 눌러야 합니다. (iOS 16.4 이상)
                </p>
                {fcmMsg && (
                  <div className="mt-4 p-3 rounded bg-[#EDF0F6] border border-[#DFE4EC]">
                    <p className="text-sm font-bold text-[#111823]">{fcmMsg.title}</p>
                    <p className="text-xs text-[#3B4653] mt-1">{fcmMsg.body}</p>
                  </div>
                )}
              </div>
              {currentUser.perm === "owner" && (
                <div className="bg-white border border-[#DFE4EC] rounded-lg p-6 shadow-sm">
                  <p className="text-sm font-bold text-[#111823] mb-1">전체 공지 발송</p>
                  <p className="text-xs text-[#6C7787] mb-4">
                    알림을 허용한 모든 집행위원 폰에 푸시가 갑니다.
                  </p>
                  <input
                    value={pushTitle}
                    onChange={(e) => setPushTitle(e.target.value)}
                    placeholder="제목"
                    className="w-full mb-2 px-3 py-2 border rounded border-[#C6CEDA] bg-white text-sm focus:outline-[#BF3329]"
                  />
                  <textarea
                    value={pushBody}
                    onChange={(e) => setPushBody(e.target.value)}
                    placeholder="내용"
                    rows={3}
                    className="w-full mb-2 px-3 py-2 border rounded border-[#C6CEDA] bg-white text-sm focus:outline-[#BF3329]"
                  />
                  <button
                    onClick={handleSendPush}
                    className="px-4 py-2 bg-[#111823] text-white font-semibold rounded text-sm hover:bg-[#3B4653] transition"
                  >
                    전체 발송
                  </button>
                  {sendResult && (
                    <p className="text-xs text-[#6C7787] mt-3">{sendResult}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
    </ConfirmProvider>
  );
}