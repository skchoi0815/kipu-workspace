// src/lib/library.test.ts — undefined 필드 회귀 테스트 (Node 내장 runner)
// 실행: npm test
// 배경: url/note에 undefined를 넣어 Firestore가 쓰기를 거부하던 버그.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLibraryPayload } from "./library.js";

const base = {
  title: "운영위 자료",
  url: "",
  owner: "사무국",
  date: "2026-09-13",
  note: "",
};

describe("buildLibraryPayload", () => {
  it("빈 문자열 url/note는 키 자체를 포함하지 않는다", () => {
    const payload = buildLibraryPayload(base, []);
    assert.ok(!("url" in payload), "url 키가 없어야 한다");
    assert.ok(!("note" in payload), "note 키가 없어야 한다");
    assert.deepEqual(
      Object.values(payload).every((v) => v !== undefined),
      true
    );
  });

  it("공백만 있는 값도 포함하지 않는다", () => {
    const payload = buildLibraryPayload({ ...base, url: "   ", note: "  " }, []);
    assert.ok(!("url" in payload));
    assert.ok(!("note" in payload));
  });

  it("값이 있으면 trim해서 포함한다", () => {
    const payload = buildLibraryPayload(
      { ...base, url: "  https://example.com/x  ", note: "  참고  " },
      []
    );
    assert.equal(payload.url, "https://example.com/x");
    assert.equal(payload.note, "참고");
  });

  it("기본 필드와 첨부파일은 그대로 전달한다", () => {
    const files = [
      { id: "f_1", name: "a.pdf", size: 10, url: "https://u", storagePath: "library/a.pdf" },
    ];
    const payload = buildLibraryPayload(base, files);
    assert.equal(payload.title, base.title);
    assert.equal(payload.owner, base.owner);
    assert.equal(payload.date, base.date);
    assert.deepEqual(payload.files, files);
  });
});
