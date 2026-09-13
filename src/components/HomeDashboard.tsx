"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  getCountFromServer,
} from "firebase/firestore";
import type { NoticeItem } from "./BoardView";
import type { CalEvent } from "./CalendarView";

interface FeeStats {
  total: number;
  unpaid: number;
}

export default function HomeDashboard({
  onGoTab,
}: {
  onGoTab: (tab: string) => void;
}) {
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [upcoming, setUpcoming] = useState<CalEvent[]>([]);
  const [fees, setFees] = useState<FeeStats | null>(null);

  useEffect(() => {
    const unsubNotices = onSnapshot(
      query(collection(db, "notices"), orderBy("ts", "desc"), limit(5)),
      (snapshot) => {
        const list: NoticeItem[] = [];
        snapshot.forEach((d) => {
          list.push({ ...(d.data() as Omit<NoticeItem, "id">), id: d.id });
        });
        setNotices(list);
      },
      (error) => console.warn("현황 공지 동기화 대기 중:", error.message)
    );

    const today = new Date().toISOString().split("T")[0];
    const unsubSchedules = onSnapshot(
      query(
        collection(db, "schedules"),
        where("date", ">=", today),
        orderBy("date", "asc"),
        limit(5)
      ),
      (snapshot) => {
        const list: CalEvent[] = [];
        snapshot.forEach((d) => {
          list.push({ ...(d.data() as Omit<CalEvent, "id">), id: d.id });
        });
        setUpcoming(list);
      },
      (error) => console.warn("현황 일정 동기화 대기 중:", error.message)
    );

    getCountFromServer(collection(db, "members"))
      .then((totalSnap) =>
        getCountFromServer(
          query(collection(db, "members"), where("feePaid", "==", false))
        ).then((unpaidSnap) =>
          setFees({ total: totalSnap.data().count, unpaid: unpaidSnap.data().count })
        )
      )
      .catch((error) => console.warn("현황 조합비 집계 대기 중:", error));

    return () => {
      unsubNotices();
      unsubSchedules();
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white border border-[#DFE4EC] rounded-lg p-6 shadow-sm">
        <p className="text-sm font-semibold text-[#111823]">집행부 현황</p>
        <p className="text-xs text-[#6C7787] mt-1">
          최신 공지, 다가오는 일정, 조합비 현황을 한눈에 봅니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-[#DFE4EC] rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#111823]">최신 공지</h3>
            <button
              onClick={() => onGoTab("board")}
              className="text-xs text-[#BF3329] font-semibold hover:underline"
            >
              공지사항으로 이동
            </button>
          </div>
          {notices.length === 0 ? (
            <p className="text-xs text-[#6C7787]">등록된 공지가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[#DFE4EC]">
              {notices.map((n) => (
                <li key={n.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[#111823] truncate">
                    {n.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-[#6C7787] font-mono">
                    {n.createdAt ? n.createdAt.split("T")[0] : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white border border-[#DFE4EC] rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#111823]">다가오는 일정</h3>
            <button
              onClick={() => onGoTab("cal")}
              className="text-xs text-[#BF3329] font-semibold hover:underline"
            >
              일정으로 이동
            </button>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-xs text-[#6C7787]">예정된 일정이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[#DFE4EC]">
              {upcoming.map((ev) => (
                <li key={ev.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[#111823] truncate">
                    {ev.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-[#6C7787] font-mono">
                    {ev.date}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="bg-white border border-[#DFE4EC] rounded-lg p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#111823]">조합비 현황</h3>
          <button
            onClick={() => onGoTab("roster")}
            className="text-xs text-[#BF3329] font-semibold hover:underline"
          >
            명부로 이동
          </button>
        </div>
        {fees === null ? (
          <p className="text-xs text-[#6C7787]">집계 중…</p>
        ) : (
          <div className="flex gap-6 text-xs">
            <span className="text-[#6C7787]">
              전체 <b className="text-[#111823]">{fees.total}</b>명
            </span>
            <span className="text-[#6C7787]">
              미납 <b className={fees.unpaid > 0 ? "text-[#BF3329]" : "text-[#111823]"}>
                {fees.unpaid}
              </b>명
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
