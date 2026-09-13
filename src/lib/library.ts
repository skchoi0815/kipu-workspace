// src/lib/library.ts
// 자료실 Firestore 문서 payload를 만드는 순수 함수.
// Firestore는 undefined 값을 거부하므로 url/note는 값이 있을 때만 포함한다.

export interface LibraryStoredFile {
  id: string;
  name: string;
  size: number;
  url: string;
  storagePath: string;
}

export interface LibraryDocFields {
  title: string;
  owner: string;
  date: string;
  files: LibraryStoredFile[];
  url?: string;
  note?: string;
}

export interface LibraryFormInput {
  title: string;
  url: string;
  owner: string;
  date: string;
  note: string;
}

export function buildLibraryPayload(
  data: LibraryFormInput,
  files: LibraryStoredFile[]
): LibraryDocFields {
  const payload: LibraryDocFields = {
    title: data.title,
    owner: data.owner,
    date: data.date,
    files,
  };
  if (data.url?.trim()) payload.url = data.url.trim();
  if (data.note?.trim()) payload.note = data.note.trim();
  return payload;
}
