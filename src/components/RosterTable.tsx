"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

export interface MemberItem {
  id: string;
  name: string;
  college: string;
  dept: string;
  status: "재직" | "휴직" | "퇴직";
  joinedDate: string;
  phone: string;
  email: string;
  feePaid: boolean;
}

export default function RosterTable({ canEdit }: { canEdit: boolean }) {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberItem | null>(null);

  // Firestore m_roster 문서 실시간 동기화 (에러 핸들러 포함)
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "data", "m_roster"),
      (snap) => {
        if (snap.exists()) {
          setMembers(snap.data().items || []);
        }
      },
      (error) => {
        console.warn("m_roster 동기화 대기 중:", error.message);
      }
    );
    return () => unsub();
  }, []);

  const saveMembers = async (newMembers: MemberItem[]) => {
    setMembers(newMembers);
    try {
      await setDoc(doc(db, "data", "m_roster"), { items: newMembers }, { merge: true });
    } catch (e) {
      console.error("조합원 명부 저장 실패:", e);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember || !editingMember.name.trim()) return;

    const idx = members.findIndex((m) => m.id === editingMember.id);
    const updated = idx >= 0
      ? members.map((m) => (m.id === editingMember.id ? editingMember : m))
      : [editingMember, ...members];

    saveMembers(updated);
    setShowModal(false);
    setEditingMember(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm("이 조합원을 명부에서 삭제하시겠습니까?")) return;
    saveMembers(members.filter((m) => m.id !== id));
  };

  const handleOpenAdd = () => {
    setEditingMember({
      id: "mem_" + Date.now(),
      name: "",
      college: "인문대",
      dept: "",
      status: "재직",
      joinedDate: new Date().toISOString().split("T")[0],
      phone: "",
      email: "",
      feePaid: true,
    });
    setShowModal(true);
  };

  const filteredMembers = members.filter(
    (m) =>
      m.name.includes(search) ||
      m.dept.includes(search) ||
      m.college.includes(search) ||
      m.phone.includes(search)
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#DFE4EC]">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름, 단과대, 학과 검색…"
            className="w-full px-3 py-1.5 border rounded-lg border-[#C6CEDA] text-xs focus:outline-[#BF3329]"
          />
        </div>
        {canEdit && (
          <button
            onClick={handleOpenAdd}
            className="px-3.5 py-1.5 bg-[#BF3329] text-white text-xs font-bold rounded-lg hover:bg-[#96271F] transition"
          >
            ＋ 조합원 등록
          </button>
        )}
      </div>

      <div className="bg-white border border-[#DFE4EC] rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#EDF0F6] border-b border-[#DFE4EC] text-[#6C7787]">
              <th className="p-3 w-12 text-center">#</th>
              <th className="p-3">성명</th>
              <th className="p-3">소속 (단과대 / 학과)</th>
              <th className="p-3 w-28">재직상태</th>
              <th className="p-3 w-32">연락처</th>
              <th className="p-3 w-36">이메일</th>
              <th className="p-3 w-24 text-center">조합비</th>
              {canEdit && <th className="p-3 w-24 text-center">관리</th>}
            </tr>
          </thead>
          <tbody>
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="p-8 text-center text-[#6C7787]">
                  등록된 조합원이 없습니다.
                </td>
              </tr>
            ) : (
              filteredMembers.map((mem, idx) => (
                <tr key={mem.id} className="border-b border-[#DFE4EC] hover:bg-[#F4F6FA]">
                  <td className="p-3 text-center text-[#6C7787]">{idx + 1}</td>
                  <td className="p-3 font-semibold text-[#111823]">{mem.name}</td>
                  <td className="p-3 text-[#3B4653]">{mem.college} {mem.dept}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      mem.status === "재직"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-[#EDF0F6] text-[#6C7787]"
                    }`}>
                      {mem.status}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[#6C7787]">{mem.phone || "-"}</td>
                  <td className="p-3 font-mono text-[#6C7787]">{mem.email || "-"}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      mem.feePaid ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                    }`}>
                      {mem.feePaid ? "납부" : "미납"}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          setEditingMember(mem);
                          setShowModal(true);
                        }}
                        className="text-blue-600 hover:underline mr-2"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(mem.id)}
                        className="text-red-500 hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-[#DFE4EC] rounded-xl w-full max-w-md p-6 shadow-xl">
            <h4 className="font-bold text-sm mb-4 text-[#111823]">
              {editingMember.name ? "조합원 정보 수정" : "새 조합원 등록"}
            </h4>
            <form onSubmit={handleSave} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="font-semibold text-[#6C7787]">성명 *</label>
                <input
                  type="text"
                  value={editingMember.name}
                  onChange={(e) => setEditingMember({ ...editingMember, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#6C7787]">단과대</label>
                  <input
                    type="text"
                    value={editingMember.college}
                    onChange={(e) => setEditingMember({ ...editingMember, college: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#6C7787]">학과 / 전공</label>
                  <input
                    type="text"
                    value={editingMember.dept}
                    onChange={(e) => setEditingMember({ ...editingMember, dept: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[#6C7787]">재직 상태</label>
                  <select
                    value={editingMember.status}
                    onChange={(e) => setEditingMember({ ...editingMember, status: e.target.value as MemberItem["status"] })}
                    className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                  >
                    <option value="재직">재직</option>
                    <option value="휴직">휴직</option>
                    <option value="퇴직">퇴직</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#6C7787]">조합비 납부</label>
                  <select
                    value={editingMember.feePaid ? "true" : "false"}
                    onChange={(e) => setEditingMember({ ...editingMember, feePaid: e.target.value === "true" })}
                    className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                  >
                    <option value="true">납부완료</option>
                    <option value="false">미납</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#6C7787]">연락처</label>
                <input
                  type="tel"
                  value={editingMember.phone}
                  onChange={(e) => setEditingMember({ ...editingMember, phone: e.target.value })}
                  placeholder="010-0000-0000"
                  className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#6C7787]">이메일</label>
                <input
                  type="email"
                  value={editingMember.email}
                  onChange={(e) => setEditingMember({ ...editingMember, email: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]"
                />
              </div>

              <div className="flex justify-end gap-2 mt-4 border-t border-[#DFE4EC] pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 border border-[#DFE4EC] rounded"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#BF3329] text-white font-bold rounded hover:bg-[#96271F]"
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