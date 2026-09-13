# KIPU Workspace 작업 지침서

한국비정규교수노동조합 강원대분회 집행부 업무 앱. Next.js 16 + React 19 + Firebase.
이 문서는 지금까지의 작업에서 확립된 절차를 정리한 것으로, 다음 작업 시 그대로 따르면 된다.

## 1. 프로젝트 구성

- `src/app/page.tsx` — 로그인 + 탭(현황/일정/공지/자료실/행사/채팅/명부/관리) 메인 화면 (클라이언트 컴포넌트)
- `src/app/layout.tsx` — 제목·아이콘·매니페스트·테마색 메타데이터
- `src/app/manifest.ts` — PWA 매니페스트 (`/manifest.webmanifest` 자동 생성)
- `src/app/icon.png` — 파비콘/탭 아이콘 원본 (노조 엠블럼 512px)
- `src/app/api/push/send/route.ts` — 푸시 발송 API (owner 인증 필수)
- `src/components/` — 탭별 화면 6종
- 데이터 저장: 공지(`notices`), 채팅(`chat`), 일정(`schedules`),
  명부(`members`), 자료메타(`library`), 행사(`events`) 컬렉션의 단건 문서.
  레거시 `data/m_*` 단일문서는 읽기만 유지(이관 후 삭제 예정).
  이관 스크립트는 `/tmp/migrate-to-collections.cjs` (repo 미커밋, 승인 후 실행)
- `src/lib/firebase.ts` — Firebase 클라이언트 초기화 (`app`, `auth`, `db`, `storage` export)
- `src/lib/profiles.ts` — 이메일→이름/직책/권한 매핑 + 프로필 결정 순수 함수
- `src/hooks/useFcm.ts` — FCM 토큰 발급·저장 (`requestFcmPermission`)
- `scripts/gen-fcm-sw.mjs` — FCM 서비스워커 생성기 (아래 5항 참조)
- `public/` — `union-logo.png`(전체 로고), `union-emblem.png`(엠블럼),
  `icon-192/512.png`, `apple-touch-icon.png`, `firebase-messaging-sw.js`(자동 생성)
- `set-passwords.mjs` — 평문 비밀번호 포함 스크립트라 2026-09-13 삭제함.
  이후 비밀번호 초기화·재발급은 Firebase 콘솔 > Authentication에서 수행한다
- `serviceAccountKey.json`, `.env.local` — gitignore 처리됨. 절대 커밋 금지

## 2. 로컬 실행과 검증

```bash
npm run dev     # http://localhost:3000 (VS Code 터미널 Ctrl+` 에서 실행)
npx tsc --noEmit
npx eslint <파일>
```

- `npm run build`(Turbopack 기본값)는 샌드박스/일부 환경에서 실패할 수 있다.
  코드 문제가 아니면 `npx next build --webpack`으로 검증한다.
- `next dev` 실행 시 AGENTS.md의 Next.js 규칙 블록이 자동 재생성되므로,
  git에 그 부분 변경이 떠도 무시한다.

## 3. 커밋·배포·폰 확인 (매번 같은 순서)

1. VS Code Source Control에서 변경 커밋 → Push (미커밋 변경은 배포에 절대 반영 안 됨)
2. Vercel 대시보드에서 해당 커밋이 Latest·Ready인지 확인
3. 폰 PWA 삭제 → 홈 화면에 새로 추가 → 로그인 → 확인
4. 데스크톱 웹 확인 시 강력 새로고침(Ctrl+Shift+R)

관리 탭 패널(푸시 알림·전체 공지 발송)은 플랫폼 분기 없이 전 기기에 표시된다.
폰에만 보이거나 웹에만 안 보이면 구버전 캐시/미배포가 원인이다.

## 4. 조합원 계정 관리 (중요)

- 직책의 정본(正本)은 **Firestore `users` 컬렉션(DB)** 이다.
  `src/lib/profiles.ts` 매핑과 어긋나면 DB를 따르고 매핑을 고친다.
  (전례: 교육/학술국장이 스크립트 주석과 반대로 적혀 있었고 DB가 맞았음)
- `perm`은 `owner`(분회장 1명) / `member`만 유효하다.
  과거 수기 입력된 `"admin"` 값은 아무 권한도 주지 않으므로 다음 로그인 때 자동 교정된다.
- 새 집행위원 추가 절차: Firebase Auth에 계정 생성 → `profiles.ts` 매핑에 추가 →
  해당자 로그인 1회(문서 자동 생성) → `users` 문서 확인.
- 등록되지 않은 이메일로 로그인하면 승인대기 화면이 뜨고 메인 UI에 못 들어간다.
  절대 가짜 owner 프로필을 씌우지 않는다(과거 장애 원인).

## 5. FCM 푸시

- 방식: 수동 서비스워커. `@ducanh2912/next-pwa`는 쓰지 않는다
  (webpack 전용이라 Next 16 기본 빌드에서는 `sw.js`가 생성되지 않음).
- `public/firebase-messaging-sw.js`는 직접 편집 금지.
  `.env.local`의 `NEXT_PUBLIC_FIREBASE_*` 값을 `scripts/gen-fcm-sw.mjs`가 박아 넣으며,
  `predev`·`prebuild`에서 자동 실행된다.
- VAPID 공개키(`NEXT_PUBLIC_FCM_VAPID_KEY`)는 Firebase 콘솔 >
  프로젝트 설정 > Cloud Messaging > 웹 푸시 인증서에서 생성해
  `.env.local`과 Vercel 환경변수에 등록한다.
- 발송 API는 `Authorization: Bearer <ID토큰>` + `users` 문서 `perm==="owner"`를 검사한다.
  전체 발송은 `fcmTokens` 전체에 500개씩 나눠 보낸다.
- Vercel 환경변수(총 9개): `NEXT_PUBLIC_*` 6개 + `NEXT_PUBLIC_FCM_VAPID_KEY` +
  `FIREBASE_PROJECT_ID`·`FIREBASE_CLIENT_EMAIL`·`FIREBASE_PRIVATE_KEY`
  (마지막 3개는 `serviceAccountKey.json`의 `project_id`·`client_email`·`private_key`).
- Firestore/Storage 규칙 정본은 repo의 `firestore.rules`·`storage.rules`이다.
  콘솔에 붙여넣어 적용하고, 규칙 변경은 반드시 두 파일에 먼저 반영한다.
- iOS 푸시는 홈 화면 설치 PWA + iOS 16.4 이상에서만 된다. PC 크롬은 바로 테스트 가능.
- 테스트 순서: 관리 탭 "알림 허용하기" → `fcmTokens` 문서 확인 → (분회장) "전체 발송".

## 6. 코드 작성 시 규칙

- `firebase-admin`은 모듈형 import만 쓴다
  (`firebase-admin/app`, `/auth`, `/firestore`, `/messaging`).
  네임스페이스 import(`import * as admin`)는 타입 에러가 난다.
- 서비스워커·compat 스크립트 버전 고정은 재현성 목적이다. 함부로 올리지 않는다.
- 새 로직은 가능하면 Firebase 비의존 순수 함수로 분리하고,
  `/tmp`에 일회성 node 스크립트로 검증한 뒤 repo에는 커밋하지 않는다.
- 읽기 전용 DB 감사가 필요하면 Admin SDK 스크립트를 `/tmp`에 두고
  `NODE_PATH=<repo>/node_modules node 스크립트.cjs`로 실행한다. 쓰기 금지.
