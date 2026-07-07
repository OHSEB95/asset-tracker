# Asset Tracker

개인 자산 관리 데스크탑 앱. 비트코인/국내주식/해외주식/IRP/ISA/연금저축펀드/안전자산(청년도약계좌,
노란우산공제 등 예적금성 상품) 등 여러 계좌의 거래내역(입금/출금/매수/매도/정리/배당/해지)을
기록하면, 보유수량·평단가·예수금을 자동 계산하고 대시보드에서 월별 원금 대비 자산 증가, 배당,
매도손익, 전체 자산 목록을 보여준다. Firebase 계정으로 로그인해야 사용 가능하며, 종료 시 자동으로
클라우드에 백업된다.

## 기술 스택

Electron + React + TypeScript + Vite(electron-vite) + better-sqlite3(SQLite) + Recharts.
인증/클라우드 동기화는 Firebase Auth + Firestore를 SDK 없이 REST API로 직접 호출(`src/main/services/firebase/`).
자동 업데이트는 `electron-updater` + GitHub Releases. 빌드는 electron-builder(Mac: dmg, Windows: nsis).

## 자주 쓰는 명령어

```bash
npm run dev          # 개발 모드 (electron-vite dev)
npx tsc --noEmit -p tsconfig.node.json   # main/preload 타입체크
npx tsc --noEmit -p tsconfig.web.json    # renderer 타입체크
npm run build:mac    # Mac용 dmg 빌드 (identity: null, afterSign.js가 자동 애드혹 서명)
npm run build:win    # Windows에서만 실행할 것 (better-sqlite3 네이티브 모듈 때문에 Mac에서 크로스 빌드 불가)
npm run release:win  # Windows용 빌드 + GitHub Releases에 --publish always로 배포 (자동 업데이트 배포용)
```

**환경변수 필요**: 실행/빌드 전에 프로젝트 루트에 `.env` 파일이 있어야 함(`.env.example` 참고,
git에는 올라가지 않음). Firebase 콘솔 > 프로젝트 설정 > 일반에서 확인 가능:
```
MAIN_VITE_FIREBASE_API_KEY=...
MAIN_VITE_FIREBASE_PROJECT_ID=...
```
electron-vite가 빌드 시점에 이 값을 `import.meta.env`로 코드에 박아 넣으므로, 패키지된 앱 자체엔
`.env` 파일이 필요 없음(빌드할 때만 있으면 됨). 이 값이 없으면 `getFirebaseConfig()`가 throw하고
로그인/회원가입/동기화가 전부 실패함(단, 앱 자체는 로그인 화면까지는 뜸).

## 아키텍처

- `src/main/` — Electron 메인 프로세스.
  - `db/` — better-sqlite3 스키마(`schema.ts`)·쿼리(`queries/`)·**버전 기반 마이그레이션 러너**(`migrations.ts`, 아래 참고).
  - `ipc/` — 도메인별 1파일, `registerXIpc()` 패턴 (`accounts`/`holdings`/`transactions`/`prices`/`rates`/`settings`/`dashboard`/`auth`/`sync`).
  - `services/priceService.ts` — 시세/환율 조회, 절대 throw 안 함.
  - `services/authSession.ts` — 로그인/회원가입/세션 갱신/멀티기기 강제 로그아웃 감지(5분 간격 폴링).
  - `services/authStore.ts` — 자동 로그인 세션은 앱 전용 로컬 키(userData의 `local.key`,
    AES-256-GCM)로 자체 암호화해 저장, 이메일 저장은 평문(민감정보 아님). 원래는 macOS
    `safeStorage`(Keychain)를 썼으나, 애드혹 서명이 리빌드마다 아이덴티티를 바꿔 Keychain이 매번
    "접근 허용" 암호를 요구하는 문제가 있어 OS Keychain 의존을 제거함.
  - `services/firebase/` — `authApi.ts`(Firebase Auth REST), `firestoreApi.ts`(Firestore REST), `config.ts`(env 읽기).
  - `services/syncService.ts` — `pushToFirestore()`/`pullFromFirestore()`(아래 "클라우드 동기화" 참고).
  - `services/updater.ts` — `electron-updater` 초기화, 패키지 빌드에서만 동작(`app.isPackaged` 체크).
- `src/preload/` — `contextBridge`로 `window.api.*`만 노출(`nodeIntegration:false`,
  `contextIsolation:true`). renderer는 better-sqlite3/fs에 절대 직접 접근하지 않음.
- `src/renderer/` — React. `state/AccountsContext.tsx`, `state/ExchangeRateContext.tsx`,
  `state/AuthContext.tsx`가 "마운트 시 fetch, context로 공유" 패턴. `App.tsx`는 로그인 안 되어
  있으면 무조건 `LoginPage`만 렌더링(로그인 게이트). 페이지는 `pages/`, 차트는 `components/charts/`(Recharts).
- `shared/` — `types.ts`(도메인 타입), `ipcChannels.ts`(채널명 상수, main/preload 공용).

## 데이터 모델 (핵심 설계 결정)

- **계좌(accounts) → 보유종목/상품(holdings) → 거래내역(transactions)** 3단 구조.
- **모든 파생 상태는 저장하지 않고 항상 재계산**(`src/main/db/queries/replay.ts`).
  - `replayHoldingState`/`cashImpact`: 주식형 보유종목의 수량/평단가, 계좌 예수금.
  - `replayCashHoldingState`: **안전자산(YOUTH_SAVINGS)** 상품의 잔액(수량·단가 개념이 없는
    예적금성 상품). DEPOSIT/WITHDRAWAL/ADJUST/CLOSE 중 해당 상품(holding_id)에 연결된 거래만
    합산해서 잔액을 구함.
  - 과거 거래를 수정/삭제해도 항상 정합성 유지됨.
- **거래유형**: `DEPOSIT`/`WITHDRAWAL`/`BUY`/`SELL`/`ADJUST`/`DIVIDEND`/`CLOSE`.
  - `ADJUST`("정리")는 수량/평단가(또는 안전자산 잔액)에 반영되지만 예수금은 건드리지 않음
    (이미 보유 중이던 종목/상품을 앱에 등록할 때 씀). `holding_id`가 있으면 항상 예수금 영향 0
    — 이 규칙은 `DEPOSIT`/`WITHDRAWAL`에도 동일하게 적용됨(안전자산 상품에 직접 연결된 입출금은
    계좌 예수금이 아니라 그 상품 잔액만 움직임).
  - `CLOSE`("해지")는 안전자산 전용 — 상품 잔액 전액을 자동으로 출금 처리(UI에서 별도 금액 입력 없음).
  - 거래는 생성 후 **수정(update) 가능**(`updateTransaction`) — 단, BUY/ADJUST 이후 같은
    종목에 SELL이 있으면 수정/삭제 둘 다 막힘(`assertNoLaterSell`).
- **해외주식(FOREIGN_STOCK) 계좌는 무조건 달러(USD) 기준으로 저장**. 통화는 계좌 테이블에
  별도 컬럼 없이 `account_type_code === 'FOREIGN_STOCK'`로 매번 추론함. 거래입력 화면엔
  USD⇄KRW 환산 입력/표시 토글이 있음(`inputInKrw` state) — 저장되는 값은 항상 USD.
- **보유종목의 배당 정보**: `dividend_per_share`(1주 배당금, 없으면 무배당), `dividend_cycle_type`
  (`MONTHLY`/`ANNUAL`/`CUSTOM`), `dividend_months`(CUSTOM일 때만, 콤마구분 월 목록 "1,2,4").
  대시보드의 "월별 배당·예상 배당" 차트가 이 정보로 미래 배당을 예측해서 보여줌.
- **대시보드는 항상 원화로 통일해서 보여줌** — 해외주식 계좌 금액은 `getUsdKrwRate()`(60초 캐시,
  실패해도 절대 throw 안 하고 마지막 성공값 또는 고정폴백 1400 반환)로 실시간 환율을 곱해 합산.
  단, "총 자산 목록"의 평단가/현재가 컬럼은 원래 통화 그대로, 가치·손익만 원화로 환산.
- **거래내역 화면**은 계좌 단위가 아니라 "자산유형"(계좌유형) 단위로 선택하게 되어 있고 "전체"
  옵션으로 모든 계좌의 거래를 한 번에 볼 수 있음. `listTransactions(filter)`가 `accountId` 또는
  `accountTypeCode` 또는 둘 다 없음(전체)을 모두 처리.
- **스키마 마이그레이션 러너 있음**(`src/main/db/migrations.ts`) — `app_settings` 테이블에
  `schema_version`을 기록해두고, `openDatabase()`가 새 DB면 최신 버전으로 바로 마킹, 기존 DB면
  버전 배열(`MIGRATIONS`)에서 현재 버전보다 높은 마이그레이션만 순서대로 실행함. **CHECK 제약이나
  컬럼 조합이 바뀌는 스키마 변경은 반드시 여기 새 버전을 추가할 것** — `schema.ts`의
  `SCHEMA_SQL`만 고치면 신규 설치에만 반영되고 기존 사용자 DB에는 반영 안 됨. `account_types`
  테이블은 예외적으로 매번 `ON CONFLICT DO UPDATE`로 코드 정의값을 덮어씀(사용자 데이터가 아니라
  참조용 목록이라 안전).
- **journal_mode는 WAL이 아니라 기본(DELETE)** — 데이터 파일이 iCloud Drive/OneDrive 같은
  클라우드 동기화 폴더에 놓일 수 있어서, WAL의 `-wal`/`-shm` 사이드카 파일이 따로 동기화되며
  깨질 위험을 피하기 위함. 앱 종료 시 DB 커넥션을 확실히 close.

## 인증 / 클라우드 동기화

- 앱 시작 시 로그인 안 되어 있으면 `LoginPage`만 보임(대시보드 등 전부 접근 불가). Firebase
  Auth(REST API)로 이메일/비밀번호 로그인·회원가입.
- **로그인 시**: `pullFromFirestore()` 실행 — Firestore에 저장된 원격 데이터가 있으면 로컬
  accounts/holdings/transactions를 통째로 DELETE 후 원격 데이터로 대체. **원격이 완전히
  비어있으면(최초 로그인 등) 로컬 데이터는 건드리지 않고 그대로 둠** — 이 가드가 없으면 새 기기
  최초 로그인 시 로컬 데이터가 사라질 수 있으니 이 동작을 바꿀 때 주의.
- **앱 종료 시**: `pushToFirestore()`로 로컬 전체를 Firestore에 덮어씀(병합 로직 없음, 마지막
  push가 이김). 설정 화면의 "이 기기 데이터를 클라우드에 백업" 버튼으로 수동 push도 가능.
- **push 안전장치 두 가지** (`src/main/services/syncService.ts`) — 둘 다 `force=true`가 아니면
  push 전에 검사하고, 문제가 있으면 예외를 던져 UI/종료 다이얼로그가 사용자에게 강제 진행 여부를
  먼저 물어보게 함(무조건 덮어쓰지 않음):
  - `SyncConflictError` — 이 기기가 마지막으로 안 known lastSyncedAt과 클라우드의 실제
    lastSyncedAt이 다르면(= 이 기기가 모르는 사이 다른 기기가 먼저 동기화했으면) 발생.
  - `AccountDeletionGuardError` — push는 로컬에 없는 계좌를 클라우드에서도 삭제하는데,
    이 기기의 로컬 데이터가 애초에 불완전하면(다른 기기에서만 입력한 계좌를 이 기기가 한 번도
    pull해본 적 없는 경우 등) 계좌 전체가 클라우드에서 통째로 사라질 수 있음 — 실제로 이
    문제로 연금저축펀드/IRP/ISA/비트코인 계좌가 클라우드에서 삭제된 사고가 있었음(2026-07-07).
    계좌 단위 삭제가 감지되면 계좌 이름을 보여주며 확인을 먼저 받음.
- **멀티기기 로그인 감지**: 로그인 시 Firestore의 `users/{uid}.activeSessionId`를 새 세션ID로
  덮어쓰고, 5분마다 이 값이 현재 기기 세션ID와 같은지 확인. 다른 기기에서 로그인해 값이 바뀌면
  이 기기는 자동 로그아웃됨(`AUTH_FORCE_LOGOUT` IPC로 렌더러에 알림).
- **주의**: 이 Firestore 동기화는 기존의 "iCloud Drive/OneDrive 폴더에 SQLite 파일 두기" 방식과
  **완전히 별개의 동기화 레이어**로 공존함(설정 화면에 둘 다 있음). 폴더 동기화는 파일 자체를
  공유, Firestore 동기화는 로그인 계정 기준으로 계좌/보유종목/거래 데이터를 클라우드에 백업·복원.
  두 기기를 동시에 켜놓고 쓰는 상황은 지원 안 함 — 위 두 안전장치가 있어도 결국 사용자가 수동으로
  판단해야 하는 확인창일 뿐, 진짜 필드 단위 병합은 아직 없음.
- **로컬 자동 백업**: `openDatabase()`가 호출될 때마다(=앱 시작 시마다) DB 파일을 통째로
  `data/backups/`에 타임스탬프 이름으로 복사해두고 최신 10개만 유지(`src/main/db/index.ts`의
  `backupBeforeOpen`). pull이 로컬 데이터를 잘못 덮어써도 그 세션 시작 시점 상태로 복구할 수
  있는 유일한 안전망이라 이 백업이 실제로 복구에 쓰인 적 있음 — 삭제/축소하지 말 것.

## 패키징 관련 주의사항

- Apple 개발자 계정 없이 배포하므로 `electron-builder.yml`에서 `mac.identity: null`로 서명을
  건너뛰고, `scripts/afterSign.js`가 빌드 후 자동으로 애드혹 서명(`codesign --sign -`)을 함.
  이게 없으면 패키지된 앱이 실행 즉시 크래시함(EXC_BREAKPOINT).
- **`productName`은 반드시 ASCII만 사용할 것**(현재 `AssetTracker`). 한글 productName으로
  하면 실행파일 이름도 한글이 되면서 앱이 실행 즉시 크래시하는 문제를 겪은 적 있음. 창
  제목/화면 텍스트는 `index.html`의 `<title>`이나 React 컴포넌트에서 한글 그대로 써도 무방.
- Windows 빌드는 이 Mac에서 크로스 빌드하지 말고, git으로 코드를 옮긴 뒤 Windows 데스크탑에서
  직접 `npm install && npm run build:win` (better-sqlite3 네이티브 모듈 재빌드 필요, Visual
  Studio Build Tools의 "Desktop development with C++" 워크로드 필요). 두 기기 모두 각자
  `.env` 파일이 로컬에 있어야 함(git으로 옮겨지지 않으므로 Firebase 콘솔 값을 양쪽에 따로 설정).
- **`electron-builder.yml`에 `publish` 설정(GitHub Releases)이 있음** — `--publish` 플래그를
  안 주면 배포 안 되지만, 실수로 배포하지 않으려면 `--publish=never`를 명시하는 게 안전.
  `npm run release:win`은 의도적으로 `--publish always`를 씀(자동 업데이트 배포 전용 스크립트).

## 데이터 동기화 (로컬 폴더)

앱 실행 후 설정 화면에서 데이터 파일 위치를 iCloud Drive/OneDrive 폴더로 지정하면 여러
기기에서 같은 SQLite 파일을 볼 수 있음(위 "인증/클라우드 동기화"의 Firestore 방식과는 별개).
