# KIPU Workspace — 강원대분회 집행부 업무 공간

Next.js 16 + React 19 + Firebase. 집행부 전용 PWA.

## 실행

```bash
npm run dev     # http://localhost:3000
npx tsc --noEmit
npx eslint src/app/page.tsx src/components/BoardView.tsx
```

- `npm run build`(Turbopack 기본값)가 샌드박스/일부 환경에서 실패하면 코드 문제가 아닐 수 있다. `npx next build --webpack`으로 검증한다.
- `next dev` 실행 시 `AGENTS.md`의 Next.js 규칙 블록이 자동 재생성된다. git에 그 부분 변경이 떠도 무시한다.

## 구조

- `src/app/page.tsx` — 로그인 + 탭 메인 화면 (분리 진행 중)
- `src/components/` — 탭별 화면 (Board/Calendar/Library/Events/Chat/Roster)
- `src/lib/firebase.ts`, `src/lib/profiles.ts` — Firebase 초기화, 이메일→프로필 순수함수
- `src/hooks/useFcm.ts`, `src/app/api/push/send/route.ts` — FCM 토큰 발급·전체발송(owner만)
- `firestore.rules`, `storage.rules` — 보안 규칙 정본 (콘솔 수기 설정 금지)
- 상세 절차는 `docs/WORKFLOW.md` 참조.

## 커밋·배포·폰 확인

1. 변경 커밋 → Push (미커밋 변경은 배포에 반영 안 됨)
2. Vercel 대시보드에서 해당 커밋이 Latest·Ready인지 확인
3. 폰 PWA 삭제 → 홈 화면에 새로 추가 → 로그인 → 확인
4. 데스크톱 확인 시 강력 새로고침(Ctrl+Shift+R)
