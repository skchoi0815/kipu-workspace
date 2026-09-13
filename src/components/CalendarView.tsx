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

export interface CalEvent {
  id: string;
  title: string;
  date: string;
  type: "meeting" | "event" | "deadline" | "general";
  memo?: string;
}

export default function CalendarView() {
  const confirmDialog = useConfirm();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<CalEvent["type"]>("meeting");
  const [memo, setMemo] = useState("");

  // Firestore schedules 컬렉션 실시간 동기화 (일정별 단건 문서)
  useEffect(() => {
    const q = query(collection(db, "schedules"), orderBy("date", "asc"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: CalEvent[] = [];
        snapshot.forEach((d) => {
          list.push({ ...(d.data() as Omit<CalEvent, "id">), id: d.id });
        });
        setEvents(list);
      },
      (error) => {
        console.warn("schedules 동기화 대기 중:", error.message);
      }
    );
    return () => unsub();
  }, []);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;

    try {
      await addDoc(collection(db, "schedules"), {
        title,
        date,
        type,
        memo,
      });
    } catch (err) {
      console.error("일정 저장 실패:", err);
      return;
    }
    setShowModal(false);
    setTitle("");
    setDate("");
    setMemo("");
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog("이 일정을 삭제하시겠습니까?"))) return;
    try {
      await deleteDoc(doc(db, "schedules", id));
    } catch (err) {
      console.error("일정 삭제 실패:", err);
    }
  };

  // 달력 계산 로직
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= lastDate; i++) days.push(i);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#DFE4EC]">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-[#111823]">{year}년 {month + 1}월</h3>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="px-2.5 py-1 text-xs border border-[#DFE4EC] rounded hover:bg-[#F4F6FA]"
            >
              ◀ 이전달
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-2.5 py-1 text-xs border border-[#DFE4EC] rounded hover:bg-[#F4F6FA]"
            >
              오늘
            </button>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="px-2.5 py-1 text-xs border border-[#DFE4EC] rounded hover:bg-[#F4F6FA]"
            >
              다음달 ▶
            </button>
          </div>
        </div>
        <button
          onClick={() => {
            setDate(new Date().toISOString().split("T")[0]);
            setShowModal(true);
          }}
          className="px-3.5 py-1.5 bg-[#BF3329] text-white text-xs font-bold rounded-lg hover:bg-[#96271F] transition"
        >
          ＋ 일정 등록
        </button>
      </div>

      {/* 월간 달력 그리드 */}
      <div className="bg-white border border-[#DFE4EC] rounded-xl p-4 overflow-x-auto">
        <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-[#6C7787] mb-2 border-b border-[#DFE4EC] pb-2 min-w-[600px]">
          <span className="text-red-500">일</span>
          <span>월</span>
          <span>화</span>
          <span>수</span>
          <span>목</span>
          <span>금</span>
          <span className="text-blue-500">토</span>
        </div>
        <div className="grid grid-cols-7 gap-1 min-w-[600px]">
          {days.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="h-24 bg-[#FAFAFC] rounded border border-transparent" />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayEvents = events.filter((e) => e.date === dateStr);

            return (
              <div
                key={day}
                className="h-24 p-1.5 border border-[#DFE4EC] rounded bg-white flex flex-col justify-between overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${idx % 7 === 0 ? "text-red-500" : idx % 7 === 6 ? "text-blue-500" : "text-[#111823]"}`}>
                    {day}
                  </span>
                  <button
                    onClick={() => {
                      setDate(dateStr);
                      setShowModal(true);
                    }}
                    className="text-[10px] text-[#98A2B0] hover:text-[#BF3329]"
                  >
                    ＋
                  </button>
                </div>
                <div className="flex flex-col gap-1 overflow-y-auto flex-1 mt-1">
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => handleDelete(ev.id)}
                      title={`${ev.title} (클릭 시 삭제)`}
                      className={`px-1 py-0.5 rounded text-[10px] truncate cursor-pointer font-medium ${
                        ev.type === "meeting"
                          ? "bg-blue-100 text-blue-800"
                          : ev.type === "event"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {ev.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-[#DFE4EC] rounded-xl w-full max-w-sm p-6 shadow-xl">
            <h4 className="font-bold text-sm mb-4 text-[#111823]">새 일정 등록</h4>
            <form onSubmit={handleAddEvent} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="font-semibold text-[#6C7787]">일자 *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-[#6C7787]">일정명 *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 제2차 운영위원회 회의"
                  className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                  required
                />
              </div>
              <div>
                <label className="font-semibold text-[#6C7787]">구분</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as CalEvent["type"])}
                  className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                >
                  <option value="meeting">회의</option>
                  <option value="event">행사</option>
                  <option value="deadline">마감/기한</option>
                  <option value="general">일반</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-[#6C7787]">메모</label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="장소나 안건 메모"
                  className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 border border-[#DFE4EC] rounded"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#BF3329] text-white font-bold rounded"
                >
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}