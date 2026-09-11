// src/lib/profiles.ts
// Auth 이메일 → 정식 프로필 매핑과 프로필 결정 로직.
// Firebase에 의존하지 않는 순수 함수로 두어 단위 테스트 가능하게 한다.

export interface KnownProfile {
  name: string;
  role: string;
  perm: "owner" | "member";
}

export interface StoredProfile {
  name: string;
  email: string;
  role: string;
  perm: "owner" | "member";
  status: "active" | "blocked" | "pending";
  phone: string;
}

export type ResolveAction = "use-existing" | "create" | "heal" | "pending";

// 집행위원 9명 (set-passwords.mjs 계정과 동일)
export const EMAIL_PROFILES: Record<string, KnownProfile> = {
  "union@kangwon.ac.kr": { name: "최승기", role: "분회장", perm: "owner" },
  "kimsam72@gmail.com": { name: "김혜정", role: "사무국장", perm: "member" },
  "lsh4444@hanmail.net": { name: "이성현", role: "총무국장", perm: "member" },
  "dnfl8898@gmail.com": { name: "김정호", role: "조직국장", perm: "member" },
  "rydbr@gmail.com": { name: "김효진", role: "학술국장", perm: "member" },
  "leekh001@kangwon.ac.kr": { name: "이관행", role: "정책국장", perm: "member" },
  "gkrtnf@gmail.com": { name: "한광수", role: "교육국장", perm: "member" },
  "jurist90@hanmail.net": { name: "나갑주", role: "법제국장", perm: "member" },
  "ansghkcpdbr@gmail.com": { name: "양승민", role: "문화체육국장", perm: "member" },
};

export function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

export function resolveProfile(
  authEmail: string,
  snapExists: boolean,
  snapData: Partial<StoredProfile> | null
): { action: ResolveAction; profile: StoredProfile } {
  const email = normalizeEmail(authEmail);
  const known = EMAIL_PROFILES[email];

  // 모르는 계정: 기존 문서가 있으면 그대로 쓰고(관리자가 직접 만든 경우),
  // 없으면 승인대기로 만든다. 절대 owner를 주지 않는다.
  if (!known) {
    if (snapExists && snapData) {
      return {
        action: "use-existing",
        profile: {
          name: snapData.name || email,
          email: snapData.email || email,
          role: snapData.role || "미지정",
          perm: snapData.perm === "owner" ? "owner" : "member",
          status: snapData.status || "pending",
          phone: snapData.phone || "",
        },
      };
    }
    return {
      action: "pending",
      profile: {
        name: email,
        email,
        role: "미지정",
        perm: "member",
        status: "pending",
        phone: "",
      },
    };
  }

  const correct: StoredProfile = {
    name: known.name,
    email,
    role: known.role,
    perm: known.perm,
    // 관리자가 차단한 계정은 치유 대상에서 제외
    status: snapData?.status === "blocked" ? "blocked" : "active",
    phone: snapData?.phone || "",
  };

  if (!snapExists || !snapData) return { action: "create", profile: correct };

  // 기존 문서가 매핑과 다르면(잘못 자동생성된 오염 문서) 교정한다.
  if (
    snapData.name !== known.name ||
    snapData.role !== known.role ||
    snapData.perm !== known.perm ||
    normalizeEmail(snapData.email) !== email
  ) {
    return { action: "heal", profile: correct };
  }
  return {
    action: "use-existing",
    profile: {
      name: snapData.name || known.name,
      email,
      role: snapData.role || known.role,
      perm: snapData.perm === "owner" ? "owner" : "member",
      status: snapData.status || "active",
      phone: snapData.phone || "",
    },
  };
}
