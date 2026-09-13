// src/lib/profiles.test.ts — 프로필 결정 로직 회귀 테스트 (Node 내장 runner)
// 실행: npm test  (Node 22+ 타입 스트리핑, 별도 프레임워크 없음)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  resolveProfile,
  EMAIL_PROFILES,
  type StoredProfile,
} from "./profiles.js";

const knownEmail = "union@kangwon.ac.kr";
const known = EMAIL_PROFILES[knownEmail];

function stored(overrides: Partial<StoredProfile> = {}): StoredProfile {
  return {
    name: known.name,
    email: knownEmail,
    role: known.role,
    perm: known.perm,
    status: "active",
    phone: "",
    ...overrides,
  };
}

describe("normalizeEmail", () => {
  it("대소문자·공백을 정리한다", () => {
    assert.equal(normalizeEmail("  Union@Kangwon.AC.KR "), knownEmail);
  });

  it("null·undefined는 빈 문자열이다", () => {
    assert.equal(normalizeEmail(null), "");
    assert.equal(normalizeEmail(undefined), "");
  });
});

describe("resolveProfile", () => {
  it("알려진 이메일의 첫 로그인은 create + active이다", () => {
    const { action, profile } = resolveProfile(knownEmail, false, null);
    assert.equal(action, "create");
    assert.equal(profile.status, "active");
    assert.equal(profile.perm, known.perm);
    assert.equal(profile.role, known.role);
  });

  it("매핑과 다른 기존 문서는 heal로 교정한다", () => {
    const { action, profile } = resolveProfile(
      knownEmail,
      true,
      stored({ role: "잘못된직책", perm: "member" })
    );
    assert.equal(action, "heal");
    assert.equal(profile.role, known.role);
    assert.equal(profile.perm, known.perm);
  });

  it("관리자가 차단한 계정은 치유 대상에서 제외한다", () => {
    const { profile } = resolveProfile(
      knownEmail,
      true,
      stored({ status: "blocked" })
    );
    assert.equal(profile.status, "blocked");
  });

  it("일치하는 기존 문서는 그대로 쓴다", () => {
    const { action } = resolveProfile(knownEmail, true, stored());
    assert.equal(action, "use-existing");
  });

  it("등록되지 않은 이메일은 승인대기로 만든다 (owner 금지)", () => {
    const { action, profile } = resolveProfile("stranger@example.com", false, null);
    assert.equal(action, "pending");
    assert.equal(profile.status, "pending");
    assert.equal(profile.perm, "member");
  });

  it("등록되지 않은 이메일의 기존 문서는 그대로 쓴다", () => {
    const { action } = resolveProfile("stranger@example.com", true, {
      name: "수기등록",
      email: "stranger@example.com",
      role: "미지정",
      perm: "member",
      status: "active",
      phone: "",
    });
    assert.equal(action, "use-existing");
  });
});
