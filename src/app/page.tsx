"use client";

import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import CalendarView from "@/components/CalendarView";
import BoardView from "@/components/BoardView";
import LibraryView from "@/components/LibraryView";
import EventsView from "@/components/EventsView";
import RosterTable from "@/components/RosterTable";
import ChatBox from "@/components/ChatBox";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  perm: "owner" | "member";
  status: "active" | "blocked";
  phone: string;
}

export default function WorkspacePage() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState<string>("home");

  // Firebase 인증 상태 감시 및 프로필 자동 동기화
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const ref = doc(db, "users", fbUser.uid);
          const snap = await getDoc(ref);

          if (snap.exists()) {
            const uData = snap.data() as UserProfile;
            setCurrentUser({ ...uData, id: fbUser.uid });
          } else {
            // 새로 생성된 DB라 프로필 문서가 없는 경우, 분회장/최고관리자 기본 프로필을 자동 생성하여 저장
            const initialProfile: UserProfile = {
              id: fbUser.uid,
              name: "최승기",
              email: fbUser.email || "",
              role: "분회장",
              perm: "owner",
              status: "active",
              phone: "",
            };

            await setDoc(ref, initialProfile);
            setCurrentUser(initialProfile);
          }
        } catch (error) {
          console.warn("프로필 조회 건너뜀 (기본 계정 정보 적용):", error);
          setCurrentUser({
            id: fbUser.uid,
            name: "최승기",
            email: fbUser.email || "",
            role: "분회장",
            perm: "owner",
            status: "active",
            phone: "",
          });
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      console.error(err);
      setLoginError("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F4F6FA] text-[#6C7787] text-sm">
        시스템 연결 중…
      </div>
    );
  }

  // 1. 로그인 화면
  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-[#F4F6FA]">
        <div className="w-full max-w-md rounded-xl border border-[#DFE4EC] bg-white p-8 shadow-sm">
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

  // 2. 메인 대시보드 화면
  const canEditRoster = 
    currentUser.perm === "owner" || 
    currentUser.role === "분회장" || 
    currentUser.role === "사무국장" || 
    currentUser.role === "조직국장";

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6FA]">
      {/* 최상단 상태 밴드 */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 bg-[#111823] text-white text-xs">
        <div className="flex items-center gap-2">
          <span className="bg-[#BF3329] text-white px-2 py-0.5 rounded-full font-bold text-[10px]">
            시범판
          </span>
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
            <span className="w-1 h-5 bg-[#BF3329] rounded-sm"></span>
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
                onClick={() => setActiveTab(menu.id)}
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

          {activeTab === "home" && (
            <div className="bg-white border border-[#DFE4EC] rounded-lg p-6 shadow-sm">
              <p className="text-sm font-semibold text-[#111823]">환영합니다, {currentUser.name}님!</p>
              <p className="text-xs text-[#6C7787] mt-1">좌측 메뉴에서 공지사항, 자료실, 행사, 일정 등을 관리할 수 있습니다.</p>
            </div>
          )}

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
            <div className="bg-white border border-[#DFE4EC] rounded-lg p-6 shadow-sm">
              <p className="text-sm text-[#6C7787]">관리자 전용 설정 영역입니다.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}