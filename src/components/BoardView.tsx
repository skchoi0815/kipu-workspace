"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export default function ChatBox({
  currentUserName,
  currentUserId,
}: {
  currentUserName: string;
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Firestore m_chat 문서 실시간 동기화 (에러 핸들러 포함)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "data", "m_chat"),
      (snap) => {
        if (snap.exists()) {
          setMessages(snap.data().items || []);
        }
      },
      (error) => {
        console.warn("m_chat 동기화 대기 중:", error.message);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      id: "msg_" + Date.now(),
      senderId: currentUserId,
      senderName: currentUserName,
      text: inputText.trim(),
      createdAt: new Date().toISOString(),
    };

    const updated = [...messages, newMsg];
    setMessages(updated);
    setInputText("");

    try {
      await setDoc(doc(db, "data", "m_chat"), { items: updated }, { merge: true });
    } catch (e) {
      console.error("메시지 전송 실패:", e);
    }
  };

  return (
    <div className="bg-white border border-[#DFE4EC] rounded-xl h-[650px] flex flex-col shadow-sm">
      <div className="p-4 border-b border-[#DFE4EC] flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm text-[#111823]">집행부 실시간 소통</h3>
          <p className="text-[11px] text-[#6C7787]">실시간으로 의견을 공유하는 업무 채팅방입니다.</p>
        </div>
        <span className="text-xs text-[#6C7787] bg-[#F4F6FA] px-2.5 py-1 rounded-full">
          전체 {messages.length}개 메시지
        </span>
      </div>

      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
        {messages.length === 0 ? (
          <div className="m-auto text-xs text-[#6C7787]">
            주고받은 대화가 없습니다. 첫 메시지를 남겨보세요.
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.senderId === currentUserId;
            const timeStr = m.createdAt
              ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "";

            return (
              <div
                key={m.id}
                className={`flex flex-col max-w-[75%] ${isMe ? "self-end items-end" : "self-start items-start"}`}
              >
                {!isMe && (
                  <span className="text-[11px] font-semibold text-[#6C7787] mb-1">
                    {m.senderName}
                  </span>
                )}
                <div
                  className={`px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words ${
                    isMe
                      ? "bg-[#BF3329] text-white rounded-br-none"
                      : "bg-[#EDF0F6] text-[#111823] rounded-bl-none"
                  }`}
                >
                  {m.text}
                </div>
                <span className="text-[10px] text-[#98A2B0] mt-1 font-mono">{timeStr}</span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-[#DFE4EC] flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="메시지를 입력하세요…"
          className="flex-1 px-3.5 py-2 border rounded-lg border-[#C6CEDA] text-xs focus:outline-[#BF3329]"
        />
        <button
          type="submit"
          className="px-5 py-2 bg-[#BF3329] text-white font-bold rounded-lg text-xs hover:bg-[#96271F] transition"
        >
          전송
        </button>
      </form>
    </div>
  );
}