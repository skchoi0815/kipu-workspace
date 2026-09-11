"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, orderBy, onSnapshot } from "firebase/firestore";

interface ChatMessage {
  id: string;
  who: string;
  uid: string;
  text: string;
  when: string;
  ts: number;
}

export default function ChatBox({ currentUserName, currentUserId }: { currentUserName: string; currentUserId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, "chat"), orderBy("ts", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data(), id: doc.id } as ChatMessage);
      });
      setMessages(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const textToSend = input;
    setInput("");

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    await addDoc(collection(db, "chat"), {
      who: currentUserName,
      uid: currentUserId,
      text: textToSend,
      when: timeStr,
      ts: Date.now(),
    });
  };

  return (
    <div className="flex flex-col h-[580px] border border-[var(--border)] rounded-lg bg-[var(--surface)] overflow-hidden">
      <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] text-xs text-[var(--muted)]">
        집행부 실시간 소통 공간입니다.
      </div>
      
      {/* 메시지 로그 */}
      <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
        {messages.map((m) => {
          const isMine = m.uid === currentUserId;
          return (
            <div key={m.id} className={`flex flex-col max-w-[70%] ${isMine ? "self-end items-end" : "self-start items-start"}`}>
              {!isMine && <span className="text-[11px] text-[var(--muted)] mb-0.5">{m.who}</span>}
              <div className={`px-3 py-2 rounded-xl text-sm break-words ${
                isMine ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] border border-[var(--border)]"
              }`}>
                {m.text}
              </div>
              <span className="text-[10px] text-[var(--faint)] mt-0.5">{m.when}</span>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* 입력창 */}
      <form onSubmit={handleSend} className="p-2 border-t border-[var(--border)] flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요"
          className="flex-1 px-3 py-2 border rounded border-[var(--border)] text-sm focus:outline-[var(--accent)]"
        />
        <button type="submit" className="px-4 py-2 bg-[var(--accent)] text-white rounded text-sm font-semibold">
          전송
        </button>
      </form>
    </div>
  );
}