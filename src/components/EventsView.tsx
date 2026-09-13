"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { useConfirm } from "./ConfirmDialog";

export interface EventQuestion {
  id: string;
  label: string;
  type: "text" | "radio" | "checkbox";
  options?: string[];
  required?: boolean;
}

export interface Attendee {
  id: string;
  name: string;
  affiliation?: string;
  phone: string;
  status: "attend" | "absent" | "undecided";
  answers?: Record<string, string | string[]>;
  submittedAt: string;
}

export interface EventItem {
  id: string;
  title: string;
  desc?: string;
  date: string;
  time?: string;
  location?: string;
  capacity?: number;
  fee?: string;
  isOpen: boolean;
  questions: EventQuestion[];
  attendees: Attendee[];
  createdAt: string;
}

export default function EventsView({ currentRole }: { currentRole: string }) {
  const confirmDialog = useConfirm();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);

  // Firestore events 컬렉션 실시간 동기화 (행사별 단건 문서)
  useEffect(() => {
    let unsub = () => {};
    try {
      unsub = onSnapshot(
        query(collection(db, "events"), orderBy("date", "desc")),
        (snapshot) => {
          const list: EventItem[] = [];
          snapshot.forEach((d) => {
            list.push({ ...(d.data() as Omit<EventItem, "id">), id: d.id });
          });
          setEvents(list);
          if (list.length > 0 && !selectedEventId) {
            setSelectedEventId(list[0].id);
          }
        },
        (error) => {
          // Turbopack 오버레이 방지를 위해 일반 로깅 처리
          console.log("Firestore events 동기화 대기:", error.code);
        }
      );
    } catch (err: unknown) {
      console.log("리스너 초기화 예외 처리:", err instanceof Error ? err.message : err);
    }
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveEventDoc = async (item: EventItem) => {
    try {
      const { id, ...fields } = item;
      await setDoc(doc(db, "events", id), fields, { merge: true });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      console.warn("행사 저장 오류 (권한 또는 연결 점검):", err.code || err.message);
      alert("데이터 저장 중 오류가 발생했습니다: " + (err.message || err.code));
    }
  };

  const currentEvent = events.find((e) => e.id === selectedEventId) || events[0] || null;

  const handleOpenNew = () => {
    setEditingEvent({
      id: "ev_" + Date.now(),
      title: "",
      desc: "",
      date: new Date().toISOString().split("T")[0],
      time: "14:00",
      location: "",
      capacity: 0,
      fee: "무료",
      isOpen: true,
      questions: [
        { id: "q_1", label: "참석 여부", type: "radio", options: ["참석", "불참"], required: true }
      ],
      attendees: [],
      createdAt: new Date().toISOString(),
    });
    setShowEditModal(true);
  };

  const handleOpenEdit = (ev: EventItem) => {
    setEditingEvent({ ...ev });
    setShowEditModal(true);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!(await confirmDialog("이 행사를 삭제하시겠습니까?"))) return;
    try {
      await deleteDoc(doc(db, "events", id));
    } catch (err) {
      console.error("행사 삭제 실패:", err);
      return;
    }
    if (selectedEventId === id) {
      const remaining = events.filter((e) => e.id !== id);
      setSelectedEventId(remaining[0]?.id || null);
    }
  };

  const handleToggleStatus = async (ev: EventItem) => {
    try {
      await updateDoc(doc(db, "events", ev.id), { isOpen: !ev.isOpen });
    } catch (err) {
      console.error("행사 상태 변경 실패:", err);
    }
  };

  const handleUpdateAttendeeStatus = async (attendeeId: string, newStatus: Attendee["status"]) => {
    if (!currentEvent) return;
    const updatedAttendees = (currentEvent.attendees || []).map((a) =>
      a.id === attendeeId ? { ...a, status: newStatus } : a
    );
    try {
      await updateDoc(doc(db, "events", currentEvent.id), { attendees: updatedAttendees });
    } catch (err) {
      console.error("참석 상태 변경 실패:", err);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#DFE4EC]">
        <div>
          <h2 className="text-lg font-bold text-[#111823]">행사 및 총회 관리</h2>
          <p className="text-xs text-[#6C7787] mt-0.5">조합원 참석 수요조사 및 사전 설문 신청을 관리합니다.</p>
        </div>
        <button
          onClick={handleOpenNew}
          className="px-4 py-2 bg-[#BF3329] text-white text-xs font-bold rounded-lg hover:bg-[#96271F] transition"
        >
          ＋ 새 행사 개설
        </button>
      </div>

      {events.length === 0 ? (
        <div className="p-12 text-center border border-[#DFE4EC] rounded-xl bg-white text-xs text-[#6C7787]">
          개설된 행사가 없습니다. 상단의 [＋ 새 행사 개설] 버튼을 눌러 첫 행사를 등록하세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold text-[#6C7787] uppercase tracking-wider">진행 중 / 지난 행사</h3>
            <div className="flex flex-col gap-2">
              {events.map((ev) => {
                const isSelected = ev.id === currentEvent?.id;
                const attendCount = ev.attendees?.filter((a) => a.status === "attend").length || 0;

                return (
                  <div
                    key={ev.id}
                    onClick={() => setSelectedEventId(ev.id)}
                    className={`p-4 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                      isSelected
                        ? "border-[#BF3329] bg-[#FBEBE9]/40 shadow-sm"
                        : "border-[#DFE4EC] bg-white hover:bg-[#F4F6FA]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          ev.isOpen
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-[#EDF0F6] text-[#6C7787]"
                        }`}
                      >
                        {ev.isOpen ? "접수중" : "마감"}
                      </span>
                      <span className="font-mono text-[11px] text-[#6C7787]">{ev.date}</span>
                    </div>
                    <div className="font-bold text-sm text-[#111823] line-clamp-1">{ev.title}</div>
                    <div className="flex items-center justify-between text-xs text-[#6C7787] mt-1 border-t border-[#DFE4EC] pt-2">
                      <span>참석 확정: <b className="text-[#BF3329]">{attendCount}</b>명</span>
                      <span>전체 {ev.attendees?.length || 0}건</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {currentEvent && (
            <div className="flex flex-col gap-5 bg-white p-6 rounded-xl border border-[#DFE4EC]">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#DFE4EC] pb-5">
                <div className="flex-1 min-w-[280px]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                        currentEvent.isOpen
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-[#EDF0F6] text-[#6C7787]"
                      }`}
                    >
                      {currentEvent.isOpen ? "신청 접수 중" : "신청 마감"}
                    </span>
                    <span className="text-xs text-[#6C7787]">
                      작성일 {currentEvent.createdAt ? currentEvent.createdAt.split("T")[0] : "-"}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-[#111823]">{currentEvent.title}</h2>
                  {currentEvent.desc && (
                    <p className="text-xs text-[#6C7787] mt-2 whitespace-pre-wrap leading-relaxed">
                      {currentEvent.desc}
                    </p>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
                    <div className="bg-[#F4F6FA] p-2.5 rounded-lg border border-[#DFE4EC]">
                      <span className="text-[#6C7787] block text-[10px]">일시</span>
                      <b className="text-[#111823] font-mono">{currentEvent.date} {currentEvent.time}</b>
                    </div>
                    <div className="bg-[#F4F6FA] p-2.5 rounded-lg border border-[#DFE4EC]">
                      <span className="text-[#6C7787] block text-[10px]">장소</span>
                      <b className="text-[#111823] truncate block">{currentEvent.location || "추후 안내"}</b>
                    </div>
                    <div className="bg-[#F4F6FA] p-2.5 rounded-lg border border-[#DFE4EC]">
                      <span className="text-[#6C7787] block text-[10px]">정원</span>
                      <b className="text-[#111823]">{currentEvent.capacity ? `${currentEvent.capacity}명` : "제한 없음"}</b>
                    </div>
                    <div className="bg-[#F4F6FA] p-2.5 rounded-lg border border-[#DFE4EC]">
                      <span className="text-[#6C7787] block text-[10px]">참가비</span>
                      <b className="text-[#111823]">{currentEvent.fee || "무료"}</b>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowPreviewModal(true)}
                    className="px-3 py-1.5 border border-[#BF3329] text-[#BF3329] rounded text-xs font-semibold hover:bg-[#FBEBE9] transition"
                  >
                    📱 신청서 미리보기
                  </button>
                  <button
                    onClick={() => handleToggleStatus(currentEvent)}
                    className="px-3 py-1.5 border border-[#DFE4EC] rounded text-xs hover:bg-[#EDF0F6] transition"
                  >
                    {currentEvent.isOpen ? "접수 마감하기" : "접수 다시 열기"}
                  </button>
                  <button
                    onClick={() => handleOpenEdit(currentEvent)}
                    className="px-3 py-1.5 border border-[#DFE4EC] rounded text-xs hover:bg-[#EDF0F6] transition"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDeleteEvent(currentEvent.id)}
                    className="px-3 py-1.5 border border-[#DFE4EC] text-red-600 rounded text-xs hover:bg-red-50 transition"
                  >
                    삭제
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#111823]">
                    신청자 명단 ({currentEvent.attendees?.length || 0}명)
                  </h3>
                  <div className="text-xs text-[#6C7787] flex gap-3">
                    <span>참석: <b className="text-emerald-600">{currentEvent.attendees?.filter(a => a.status === "attend").length || 0}</b></span>
                    <span>불참: <b className="text-red-500">{currentEvent.attendees?.filter(a => a.status === "absent").length || 0}</b></span>
                    <span>미정: <b>{currentEvent.attendees?.filter(a => a.status === "undecided").length || 0}</b></span>
                  </div>
                </div>

                <div className="overflow-x-auto border border-[#DFE4EC] rounded-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#EDF0F6] border-b border-[#DFE4EC] text-[#6C7787]">
                        <th className="p-3 w-12 text-center">#</th>
                        <th className="p-3 w-28">이름</th>
                        <th className="p-3 w-32">소속</th>
                        <th className="p-3 w-36">연락처</th>
                        <th className="p-3 w-28">상태</th>
                        <th className="p-3">설문 응답 내용</th>
                        <th className="p-3 w-28 text-right">제출일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!currentEvent.attendees || currentEvent.attendees.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-[#6C7787]">
                            아직 접수된 신청 내역이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        currentEvent.attendees.map((attendee, idx) => (
                          <tr key={attendee.id} className="border-b border-[#DFE4EC] hover:bg-[#F4F6FA]">
                            <td className="p-3 text-center text-[#6C7787]">{idx + 1}</td>
                            <td className="p-3 font-semibold text-[#111823]">{attendee.name}</td>
                            <td className="p-3 text-[#6C7787]">{attendee.affiliation || "-"}</td>
                            <td className="p-3 font-mono text-[#6C7787]">{attendee.phone || "-"}</td>
                            <td className="p-3">
                              <select
                                value={attendee.status}
                                onChange={(e) => handleUpdateAttendeeStatus(attendee.id, e.target.value as Attendee["status"])}
                                className={`px-2 py-1 rounded text-[11px] font-bold border border-[#DFE4EC] ${
                                  attendee.status === "attend"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : attendee.status === "absent"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                <option value="attend">참석</option>
                                <option value="absent">불참</option>
                                <option value="undecided">미정</option>
                              </select>
                            </td>
                            <td className="p-3 text-[#3B4653]">
                              {attendee.answers && Object.keys(attendee.answers).length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  {Object.entries(attendee.answers).map(([qId, ans]) => {
                                    const q = currentEvent.questions.find((x) => x.id === qId);
                                    return (
                                      <div key={qId} className="text-[11px]">
                                        <span className="text-[#6C7787]">{q?.label || qId}:</span>{" "}
                                        <b>{Array.isArray(ans) ? ans.join(", ") : ans}</b>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-[#98A2B0]">-</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono text-[11px] text-[#6C7787]">
                              {attendee.submittedAt ? attendee.submittedAt.split("T")[0] : "-"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showEditModal && editingEvent && (
        <EventEditModal
          eventData={editingEvent}
          onClose={() => setShowEditModal(false)}
          onSave={(saved) => {
            saveEventDoc(saved);
            setSelectedEventId(saved.id);
            setShowEditModal(false);
          }}
        />
      )}

      {showPreviewModal && currentEvent && (
        <MobileFormPreview
          eventItem={currentEvent}
          onClose={() => setShowPreviewModal(false)}
          onSubmitSuccess={(newAttendee) => {
            const updatedAttendees = [newAttendee, ...(currentEvent.attendees || [])];
            updateDoc(doc(db, "events", currentEvent.id), { attendees: updatedAttendees })
              .catch((err) => console.error("신청 접수 실패:", err));
            alert("신청서가 성공적으로 접수되었습니다!");
            setShowPreviewModal(false);
          }}
        />
      )}
    </div>
  );
}

function EventEditModal({
  eventData,
  onClose,
  onSave,
}: {
  eventData: EventItem;
  onClose: () => void;
  onSave: (saved: EventItem) => void;
}) {
  const [form, setForm] = useState<EventItem>({ ...eventData });

  const handleAddQuestion = () => {
    const newQ: EventQuestion = {
      id: "q_" + Date.now(),
      label: "",
      type: "text",
      required: false,
    };
    setForm({ ...form, questions: [...form.questions, newQ] });
  };

  const handleRemoveQuestion = (qId: string) => {
    setForm({ ...form, questions: form.questions.filter((q) => q.id !== qId) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white border border-[#DFE4EC] rounded-xl w-full max-w-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-base mb-4 text-[#111823]">
          {eventData.title ? "행사 정보 수정" : "새 행사 개설"}
        </h3>

        <div className="flex flex-col gap-4 text-xs">
          <div>
            <label className="font-semibold text-[#6C7787]">행사 제목 *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="예: 2026 하계 분회 워크숍 / 임시총회"
              className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA] text-sm"
              required
            />
          </div>

          <div>
            <label className="font-semibold text-[#6C7787]">행사 상세 설명</label>
            <textarea
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              rows={3}
              placeholder="일정 세부사항 및 준비물 등을 입력하세요"
              className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-[#6C7787]">행사 일자 *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                required
              />
            </div>
            <div>
              <label className="font-semibold text-[#6C7787]">행사 시간</label>
              <input
                type="text"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                placeholder="예: 14:00 ~ 18:00"
                className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-[#6C7787]">장소</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="예: 삼척캠퍼스 본관 301호"
                className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
              />
            </div>
            <div>
              <label className="font-semibold text-[#6C7787]">정원 (0: 제한없음)</label>
              <input
                type="number"
                value={form.capacity || 0}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
              />
            </div>
            <div>
              <label className="font-semibold text-[#6C7787]">참가비</label>
              <input
                type="text"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
                placeholder="예: 무료 / 10,000원"
                className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
              />
            </div>
          </div>

          <div className="border-t border-[#DFE4EC] pt-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="font-bold text-[#111823]">신청서 추가 질문 설정</label>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="px-2.5 py-1 bg-[#EDF0F6] border border-[#DFE4EC] rounded text-[11px] font-semibold hover:bg-[#E4E9F1]"
              >
                ＋ 질문 추가
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {form.questions.map((q, idx) => (
                <div key={q.id} className="p-3 rounded-lg border border-[#DFE4EC] bg-[#F4F6FA] flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#6C7787]">Q{idx + 1}</span>
                    <input
                      type="text"
                      value={q.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm({
                          ...form,
                          questions: form.questions.map((item) => (item.id === q.id ? { ...item, label: val } : item)),
                        });
                      }}
                      placeholder="질문 내용"
                      className="flex-1 px-2.5 py-1.5 border rounded bg-white border-[#C6CEDA]"
                    />
                    <select
                      value={q.type}
                      onChange={(e) => {
                        const val = e.target.value as EventQuestion["type"];
                        setForm({
                          ...form,
                          questions: form.questions.map((item) => (item.id === q.id ? { ...item, type: val } : item)),
                        });
                      }}
                      className="px-2 py-1.5 border rounded bg-white border-[#C6CEDA]"
                    >
                      <option value="text">단답형</option>
                      <option value="radio">객관식 (단일선택)</option>
                      <option value="checkbox">객관식 (다중선택)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(q.id)}
                      className="text-red-500 hover:underline px-1"
                    >
                      삭제
                    </button>
                  </div>

                  {(q.type === "radio" || q.type === "checkbox") && (
                    <div className="pl-6">
                      <input
                        type="text"
                        value={q.options ? q.options.join(", ") : ""}
                        onChange={(e) => {
                          const opts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                          setForm({
                            ...form,
                            questions: form.questions.map((item) => (item.id === q.id ? { ...item, options: opts } : item)),
                          });
                        }}
                        placeholder="선택 항목 (쉼표 구분: 예: 참석, 불참)"
                        className="w-full px-2.5 py-1.5 border rounded bg-white border-[#C6CEDA] text-[11px]"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6 border-t border-[#DFE4EC] pt-4">
          <button type="button" onClick={onClose} className="px-3.5 py-1.5 border border-[#DFE4EC] rounded text-xs">
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              if (!form.title.trim()) {
                alert("행사 제목을 입력해 주세요.");
                return;
              }
              onSave(form);
            }}
            className="px-4 py-1.5 bg-[#BF3329] text-white font-bold rounded text-xs hover:bg-[#96271F]"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileFormPreview({
  eventItem,
  onClose,
  onSubmitSuccess,
}: {
  eventItem: EventItem;
  onClose: () => void;
  onSubmitSuccess: (attendee: Attendee) => void;
}) {
  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Attendee["status"]>("attend");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("이름을 입력하세요.");
      return;
    }

    const newAttendee: Attendee = {
      id: "att_" + Date.now(),
      name,
      affiliation,
      phone,
      status,
      answers,
      submittedAt: new Date().toISOString(),
    };

    onSubmitSuccess(newAttendee);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white border-4 border-[#3B4653] rounded-[32px] w-full max-w-[380px] p-5 shadow-2xl max-h-[85vh] flex flex-col relative overflow-hidden">
        <div className="w-24 h-4 bg-[#3B4653] rounded-full mx-auto mb-3 shrink-0" />
        <div className="overflow-y-auto flex-1 pr-1">
          <div className="border-b border-[#DFE4EC] pb-3 mb-3">
            <span className="text-[10px] font-bold text-[#BF3329] bg-[#FBEBE9] px-2 py-0.5 rounded-full">
              모바일 신청서 미리보기
            </span>
            <h3 className="font-bold text-base mt-2 text-[#111823]">{eventItem.title}</h3>
            <p className="text-[11px] text-[#6C7787] mt-1">{eventItem.desc}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-xs">
            <div>
              <label className="font-bold text-[#111823]">성명 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
              />
            </div>
            <div>
              <label className="font-bold text-[#111823]">소속 학과</label>
              <input
                type="text"
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
              />
            </div>
            <div>
              <label className="font-bold text-[#111823]">연락처</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 mt-3 bg-[#BF3329] text-white font-bold rounded-lg hover:bg-[#96271F] transition text-xs"
            >
              신청서 제출
            </button>
          </form>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 py-1 text-center text-xs text-[#6C7787] hover:underline"
        >
          닫기
        </button>
      </div>
    </div>
  );
}