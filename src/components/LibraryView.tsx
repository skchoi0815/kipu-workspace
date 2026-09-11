"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import imageCompression from "browser-image-compression";
import { db, storage } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

// ================= Types =================
interface CloudFile {
  id: string;
  name: string;
  size: number;
  url: string;
  storagePath: string;
}

interface LibItem {
  id: string;
  title: string;
  url?: string;
  owner: string;
  date: string;
  note?: string;
  files: CloudFile[];
}

interface FormData {
  title: string;
  url: string;
  owner: string;
  date: string;
  note: string;
}

// ================= Main Component =================
export default function LibraryView({ currentRole }: { currentRole: string }) {
  const [items, setItems] = useState<LibItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingItem, setEditingItem] = useState<LibItem | null>(null);
  const [viewingItem, setViewingItem] = useState<LibItem | null>(null);

  // Firestore 데이터 실시간 구독
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "data", "m_doc"), (snap) => {
      if (snap.exists()) {
        setItems(snap.data().items || []);
      }
    });
    return () => unsub();
  }, []);

  // 자료 삭제 (Storage 파일 포함)
  const handleDelete = async (item: LibItem) => {
    if (!confirm(`'${item.title}' 자료를 삭제하시겠습니까? 첨부된 파일도 모두 서버에서 영구 삭제됩니다.`)) return;

    try {
      // 1. Cloud Storage에서 실제 파일 삭제
      if (item.files) {
        for (const file of item.files) {
          if (file.storagePath) {
            const fileRef = ref(storage, file.storagePath);
            await deleteObject(fileRef).catch((err) => console.warn("스토리지 파일 삭제 실패:", err));
          }
        }
      }

      // 2. Firestore 메타데이터 삭제
      const updated = items.filter((it) => it.id !== item.id);
      await setDoc(doc(db, "data", "m_doc"), { items: updated }, { merge: true });
      if (viewingItem?.id === item.id) setViewingItem(null);
    } catch (err) {
      console.error("삭제 중 오류:", err);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const handleOpenNew = () => {
    setEditingItem(null);
    setShowUploadModal(true);
  };

  const filteredItems = items.filter((it) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      it.title.toLowerCase().includes(q) ||
      (it.note && it.note.toLowerCase().includes(q)) ||
      (it.owner && it.owner.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* 액션 바 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="제목·메모·담당 검색"
          className="px-3.5 py-1.5 border rounded-full border-[#DFE4EC] bg-white text-xs w-64 focus:outline-[#BF3329]"
        />
        <button
          onClick={handleOpenNew}
          className="px-3.5 py-1.5 bg-[#BF3329] text-white text-xs font-semibold rounded hover:bg-[#96271F] transition"
        >
          ＋ 자료 등록
        </button>
      </div>

      {/* 테이블 */}
      <LibraryTable 
        items={filteredItems} 
        onView={setViewingItem} 
        onEdit={(item: LibItem) => { setEditingItem(item); setShowUploadModal(true); }} 
        onDelete={handleDelete} 
      />

      {/* 모달 */}
      {viewingItem && <DetailViewer item={viewingItem} onClose={() => setViewingItem(null)} />}
      {showUploadModal && (
        <UploadModal 
          currentRole={currentRole} 
          existingItems={items}
          editingItem={editingItem} 
          onClose={() => setShowUploadModal(false)} 
        />
      )}
    </div>
  );
}

// ================= Sub Component: Library Table =================
function LibraryTable({ items, onView, onEdit, onDelete }: any) {
  const formatSize = (bytes: number) => {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + "MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + "KB";
    return bytes + "B";
  };

  return (
    <div className="overflow-x-auto border border-[#DFE4EC] rounded-lg bg-white">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="bg-[#EDF0F6] border-b border-[#DFE4EC] text-[#6C7787]">
            <th className="p-3">제목 / 첨부파일</th>
            <th className="p-3 w-28">담당</th>
            <th className="p-3 w-28">등록일</th>
            <th className="p-3 w-28 text-right">관리</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={4} className="p-8 text-center text-[#6C7787]">
                등록된 자료가 없습니다. 우측 상단의 [＋ 자료 등록] 버튼을 눌러주세요.
              </td>
            </tr>
          ) : (
            items.map((item: LibItem) => (
              <tr key={item.id} className="border-b border-[#DFE4EC] hover:bg-[#F4F6FA]">
                <td className="p-3">
                  <div onClick={() => onView(item)} className="font-semibold text-sm text-[#111823] cursor-pointer hover:underline">
                    {item.title}
                  </div>
                  {item.note && <div className="text-xs text-[#6C7787] mt-0.5 truncate max-w-md">{item.note}</div>}
                  {item.url && (
                    <div className="mt-1">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                        외부 링크 열기 ↗
                      </a>
                    </div>
                  )}
                  {item.files?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {item.files.map((file) => (
                        <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#F4F6FA] border border-[#DFE4EC] rounded text-[11px] text-[#3B4653] hover:bg-[#EDF0F6] transition font-medium">
                          <span>⬇ {file.name}</span>
                          <span className="text-[#6C7787]">({formatSize(file.size)})</span>
                        </a>
                      ))}
                    </div>
                  )}
                </td>
                <td className="p-3 text-[#6C7787]">{item.owner}</td>
                <td className="p-3 font-mono text-[#6C7787]">{item.date}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => onEdit(item)} className="px-2 py-1 border border-[#DFE4EC] rounded hover:bg-[#EDF0F6] text-[11px]">수정</button>
                    <button onClick={() => onDelete(item)} className="px-2 py-1 border border-[#DFE4EC] rounded hover:bg-[#EDF0F6] text-[11px] text-red-600">삭제</button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ================= Sub Component: Upload Form Modal =================
function UploadModal({ currentRole, existingItems, editingItem, onClose }: any) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      title: editingItem?.title || "",
      url: editingItem?.url || "",
      owner: editingItem?.owner || currentRole || "집행부",
      date: editingItem?.date || new Date().toISOString().split("T")[0],
      note: editingItem?.note || "",
    }
  });

  const [filesToUpload, setFilesToUpload] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<CloudFile[]>(editingItem?.files || []);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 압축 및 스테이징 (Main Thread 블로킹 방지)
  const processFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles: File[] = [];

    for (let i = 0; i < fileList.length; i++) {
      let file = fileList[i];
      if (file.size > 25 * 1024 * 1024) {
        alert(`'${file.name}' 파일은 25MB를 초과할 수 없습니다.`);
        continue;
      }
      // 이미지 파일인 경우 백그라운드 압축 적용
      if (/^image\//.test(file.type)) {
        try {
          file = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1920, useWebWorker: true });
        } catch (error) {
          console.error("이미지 압축 실패:", error);
        }
      }
      newFiles.push(file);
    }
    setFilesToUpload((prev) => [...prev, ...newFiles]);
  };

  const removeFileToUpload = (index: number) => {
    setFilesToUpload((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (id: string) => {
    setExistingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // 폼 제출 및 Firebase Storage 업로드
  const onSubmit = async (data: FormData) => {
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const uploadedCloudFiles: CloudFile[] = [...existingFiles];
      
      let completedFiles = 0;
      for (const file of filesToUpload) {
        const uniquePath = `library/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, uniquePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = ((snapshot.bytesTransferred / snapshot.totalBytes) + completedFiles) / filesToUpload.length * 100;
              setUploadProgress(Math.round(progress));
            },
            (error) => reject(error),
            async () => {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              uploadedCloudFiles.push({
                id: `f_${Date.now()}_${Math.random().toString(36).substring(2)}`,
                name: file.name,
                size: file.size,
                url: downloadUrl,
                storagePath: uniquePath,
              });
              completedFiles++;
              resolve();
            }
          );
        });
      }

      // Firestore 저장
      const finalItem: LibItem = {
        id: editingItem ? editingItem.id : `lib_${Date.now()}`,
        title: data.title,
        url: data.url || undefined,
        owner: data.owner,
        date: data.date,
        note: data.note || undefined,
        files: uploadedCloudFiles,
      };

      const updatedItems = editingItem 
        ? existingItems.map((it: LibItem) => it.id === editingItem.id ? finalItem : it)
        : [finalItem, ...existingItems];

      await setDoc(doc(db, "data", "m_doc"), { items: updatedItems }, { merge: true });
      onClose();
    } catch (error) {
      console.error("업로드 실패:", error);
      alert("업로드 중 오류가 발생했습니다. 권한(Firebase Storage 규칙)을 확인하세요.");
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white border border-[#DFE4EC] rounded-xl w-full max-w-lg p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-base mb-4">{editingItem ? "자료 수정" : "자료 등록"}</h3>
        
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 text-xs">
          <div>
            <label className="font-semibold text-[#6C7787]">자료 이름</label>
            <input {...register("title", { required: true })} className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA] text-sm" placeholder="자료 제목" />
            {errors.title && <span className="text-red-500 text-[10px]">필수 입력 항목입니다.</span>}
          </div>

          {/* 드래그 앤 드롭 영역 */}
          <div>
            <label className="font-semibold text-[#6C7787]">파일 첨부 (이미지는 자동 최적화 적용)</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); processFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-1 border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition ${isDragging ? "border-[#BF3329] bg-[#FBEBE9]" : "border-[#C6CEDA] bg-[#F4F6FA]"}`}
            >
              <p className="text-[#6C7787]">클릭하거나 파일을 이곳으로 끌어다 놓으세요</p>
              <input type="file" multiple ref={fileInputRef} onChange={(e) => processFiles(e.target.files)} className="hidden" />
            </div>

            <div className="flex flex-col gap-1 mt-2">
              {existingFiles.map((f) => (
                <div key={f.id} className="flex justify-between p-2 rounded bg-[#EDF0F6] text-[11px]">
                  <span>[기존] {f.name}</span>
                  <button type="button" onClick={() => removeExistingFile(f.id)} className="text-red-500">삭제</button>
                </div>
              ))}
              {filesToUpload.map((f, i) => (
                <div key={i} className="flex justify-between p-2 rounded bg-[#FBEBE9] text-[11px]">
                  <span>[대기] {f.name} ({(f.size / 1024).toFixed(1)}KB)</span>
                  <button type="button" onClick={() => removeFileToUpload(i)} className="text-red-500">취소</button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-[#6C7787]">담당</label>
              <input {...register("owner", { required: true })} className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]" />
            </div>
            <div>
              <label className="font-semibold text-[#6C7787]">등록일</label>
              <input type="date" {...register("date", { required: true })} className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]" />
            </div>
          </div>

          <div>
            <label className="font-semibold text-[#6C7787]">외부 문서 링크 (선택)</label>
            <input type="url" {...register("url")} className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]" placeholder="https://..." />
          </div>

          <div>
            <label className="font-semibold text-[#6C7787]">메모 (선택)</label>
            <textarea {...register("note")} rows={3} className="w-full mt-1 px-3 py-2 border rounded border-[#C6CEDA]" />
          </div>

          {/* 프로그레스 바 UI */}
          {isUploading && (
            <div className="w-full bg-[#E4E9F1] rounded-full h-2.5 mt-2">
              <div className="bg-[#BF3329] h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
              <p className="text-center text-[10px] mt-1 text-[#6C7787]">업로드 중... {uploadProgress}%</p>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" disabled={isUploading} onClick={onClose} className="px-3 py-1.5 border border-[#DFE4EC] rounded hover:bg-[#EDF0F6]">취소</button>
            <button type="submit" disabled={isUploading} className="px-4 py-1.5 bg-[#BF3329] text-white font-bold rounded hover:bg-[#96271F] disabled:opacity-50">
              {isUploading ? "처리 중..." : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ================= Sub Component: Detail Viewer Modal =================
function DetailViewer({ item, onClose }: { item: LibItem, onClose: () => void }) {
  const formatSize = (bytes: number) => {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + "MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + "KB";
    return bytes + "B";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white border border-[#DFE4EC] rounded-xl w-full max-w-md p-6 shadow-lg max-h-[85vh] overflow-y-auto">
        <h3 className="font-bold text-base mb-3">{item.title}</h3>
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex justify-between py-1 border-b border-[#DFE4EC]"><span className="text-[#6C7787] font-semibold">담당</span><span>{item.owner}</span></div>
          <div className="flex justify-between py-1 border-b border-[#DFE4EC]"><span className="text-[#6C7787] font-semibold">등록일</span><span className="font-mono">{item.date}</span></div>
          {item.url && (
            <div className="py-1 border-b border-[#DFE4EC]">
              <span className="text-[#6C7787] font-semibold block mb-1">외부 링크</span>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{item.url} ↗</a>
            </div>
          )}
          {item.note && (
            <div className="py-2 border-b border-[#DFE4EC]">
              <span className="text-[#6C7787] font-semibold block mb-1">메모</span>
              <p className="text-[#111823] whitespace-pre-wrap">{item.note}</p>
            </div>
          )}
          <div className="mt-2">
            <span className="text-[#6C7787] font-semibold block mb-1.5">첨부파일 다운로드</span>
            {item.files?.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {item.files.map((file) => (
                  <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-2.5 rounded border border-[#DFE4EC] bg-[#F4F6FA] hover:bg-[#EDF0F6] text-left">
                    <span className="truncate max-w-[240px] font-medium text-blue-600">⬇ {file.name}</span>
                    <span className="text-[#6C7787] text-[11px]">{formatSize(file.size)}</span>
                  </a>
                ))}
              </div>
            ) : (<p className="text-[#98A2B0]">첨부된 파일이 없습니다.</p>)}
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <button type="button" onClick={onClose} className="px-4 py-1.5 bg-[#EDF0F6] border border-[#DFE4EC] rounded font-semibold hover:bg-[#E4E9F1]">닫기</button>
        </div>
      </div>
    </div>
  );
}