"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { useConfirm } from "./ConfirmDialog";

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  ts: number;
  createdAt: string;
}

export default function BoardView({
  currentUserName,
  currentUserId,
}: {
  currentUserName: string;
  currentUserId: string;
}) {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmDialog = useConfirm();

  useEffect(() => {
    const q = query(collection(db, "notices"), orderBy("ts", "desc"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: NoticeItem[] = [];
        snapshot.forEach((d) => {
          list.push({ ...(d.data() as Omit<NoticeItem, "id">), id: d.id });
        });
        setNotices(list);
      },
      (error) => {
        console.warn("notices 동기화 대기 중:", error.message);
      }
    );
    return () => unsub();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "notices"), {
        title: title.trim(),
        body: body.trim(),
        authorId: currentUserId,
        authorName: currentUserName,
        ts: Date.now(),
        createdAt: new Date().toISOString(),
      });
      setTitle("");
      setBody("");
    } catch (err) {
      console.error("공지 등록 실패:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (notice: NoticeItem) => {
    if (notice.authorId !== currentUserId) return;
    if (!(await confirmDialog(`'${notice.title}' 공지를 삭제하시겠습니까?`))) return;
    try {
      await deleteDoc(doc(db, "notices", notice.id));
      if (expandedId === notice.id) setExpandedId(null);
    } catch (err) {
      console.error("공지 삭제 실패:", err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={handleCreate}
        className="bg-white border border-[#DFE4EC] rounded-xl p-4 shadow-sm flex flex-col gap-2"
      >
        <p className="text-sm font-bold text-[#111823]">공지 작성</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          maxLength={120}
          className="w-full px-3 py-2 border rounded-lg border-[#C6CEDA] bg-white text-sm focus:outline-[#BF3329]"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="내용"
          rows={3}
          maxLength={5000}
          className="w-full px-3 py-2 border rounded-lg border-[#C6CEDA] bg-white text-sm focus:outline-[#BF3329]"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || !title.trim() || !body.trim()}
            className="px-4 py-2 bg-[#BF3329] text-white font-bold rounded-lg text-xs hover:bg-[#96271F] transition disabled:opacity-40"
          >
            {saving ? "등록 중…" : "공지 등록"}
          </button>
        </div>
      </form>

      <div className="bg-white border border-[#DFE4EC] rounded-xl overflow-hidden shadow-sm">
        {notices.length === 0 ? (
          <p className="p-6 text-xs text-[#6C7787] text-center">
            등록된 공지가 없습니다. 첫 공지를 작성해 보세요.
          </p>
        ) : (
          <ul className="divide-y divide-[#DFE4EC]">
            {notices.map((n) => {
              const expanded = expandedId === n.id;
              const dateStr = n.createdAt
                ? new Date(n.createdAt).toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "";
              return (
                <li key={n.id} className="p-4">
                  <button
                    onClick={() => setExpandedId(expanded ? null : n.id)}
                    className="w-full text-left flex items-center justify-between gap-3"
                  >
                    <span className="text-sm font-bold text-[#111823] truncate">
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-[#6C7787]">
                      {n.authorName} · {dateStr}
                    </span>
                  </button>
                  {expanded && (
                    <div className="mt-2">
                      <p className="text-xs text-[#3B4653] whitespace-pre-wrap leading-relaxed">
                        {n.body}
                      </p>
                      {n.authorId === currentUserId && (
                        <div className="mt-3 flex justify-end">
                          <button
                            onClick={() => handleDelete(n)}
                            className="px-3 py-1 border border-[#C6CEDA] text-[#3B4653] rounded text-xs hover:bg-[#F4F6FA] transition"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
