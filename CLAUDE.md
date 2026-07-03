# Asset Tracker

개인 자산 관리 데스크탑 앱. 비트코인/국내주식/해외주식/IRP/ISA/연금저축펀드/청년도약계좌 등
여러 계좌의 거래내역(입금/출금/매수/매도/정리/배당)을 기록하면, 보유수량·평단가·예수금을
자동 계산하고 대시보드에서 월별 원금 대비 자산 증가, 배당, 매도손익, 전체 자산 목록을 보여준다.

## 기술 스택

Electron + React + TypeScript + Vite(electron-vite) + better-sqlite3(SQLite) + Recharts.
빌드는 electron-builder(Mac: dmg, Windows: nsis).

## 자주 쓰는 명령어

```bash
npm run dev          # 개발 모드 (electron-vite dev)
npx tsc --noEmit -p tsconfig.node.json   # main/preload 타입체크
npx tsc --noEmit -p tsconfig.web.json    # renderer 타입체크
npm run build:mac    # Mac용 dmg 빌드 (identity: null, afterSign.js가 자동 애드혹 서명)
npm run build:win    # Windows에서만 실행할 것 (better-sqlite3 네이티브 모듈 때문에 Mac에서 크로스 빌드 불가)
```

## 아키텍처

- `src/main/` — Electron 메인 프로세스. `db/` (better-sqlite3 스키마·쿼리), `ipc/` (도메인별 1파일,
  `registerXIpc()` 패턴), `services/priceService.ts` (시세/환율 조회, 절대 throw 안 함).
- `src/preload/` — `contextBridge`로 `window.api.*`만 노출(`nodeIntegration:false`,
  `contextIsolation:true`). renderer는 better-sqlite3/fs에 절대 직접 접근하지 않음.
- `src/renderer/` — React. `state/AccountsContext.tsx`, `state/ExchangeRateContext.tsx`가
  "마운트 시 fetch, context로 공유" 패턴. 페이지는 `pages/`, 차트는
  `components/charts/`(Recharts).
- `shared/` — `types.ts`(도메인 타입), `ipcChannels.ts`(채널명 상수, main/preload 공용).

## 데이터 모델 (핵심 설계 결정)

- **계좌(accounts) → 보유종목(holdings) → 거래내역(transactions)** 3단 구조. 예전엔
  "월별 요약 한 줄" 방식이었으나 실제 사용자가 여러 종목을 보유한 계좌(연금저축펀드 등)를
  못 표현해서 폐기하고 이 구조로 전면 교체함.
- **모든 파생 상태는 저장하지 않고 항상 재계산**(`src/main/db/queries/replay.ts`의
  `replayHoldingState`/`cashImpact`). 보유수량/평단가/예수금 전부 거래내역을 날짜순
  리플레이해서 계산 — 과거 거래를 수정/삭제해도 항상 정합성 유지됨.
- **거래유형**: `DEPOSIT`/`WITHDRAWAL`/`BUY`/`SELL`/`ADJUST`/`DIVIDEND`.
  `ADJUST`("정리")는 BUY와 동일하게 수량/평단가에 반영되지만 예수금은 건드리지 않음
  (이미 보유 중이던 종목을 앱에 등록할 때 씀).
- **해외주식(FOREIGN_STOCK) 계좌는 무조건 달러(USD) 기준으로 저장**. 통화는 계좌 테이블에
  별도 컬럼 없이 `account_type_code === 'FOREIGN_STOCK'`로 매번 추론함(스키마 단순화 목적).
  거래입력 화면엔 USD⇄KRW 환산 입력/표시 토글이 있음(`inputInKrw` state) — 저장되는 값은
  항상 USD, 토글은 표시/입력 변환만 담당.
- **대시보드는 항상 원화로 통일해서 보여줌** — 해외주식 계좌 금액은
  `getUsdKrwRate()`(60초 캐시, 실패해도 절대 throw 안 하고 마지막 성공값 또는 고정폴백 1400
  반환)로 실시간 환율을 곱해 합산. 단, "총 자산 목록"의 평단가/현재가 컬럼은 원래 통화(달러)
  그대로 보여주고, 가치·손익처럼 합산되는 금액만 원화로 환산(사용자가 쓰던 엑셀 포트폴리오
  표기 방식을 그대로 따름).
- **스키마에 마이그레이션 러너가 없음** — `CREATE TABLE IF NOT EXISTS`만 씀. 기존 테이블의
  컬럼/CHECK 제약을 바꾸는 스키마 변경(예: ADJUST 타입 추가)은 로컬 DB에 자동 반영되지
  않으므로, 개발 중엔 해당 테이블을 수동으로 DROP 후 재생성하거나 데이터를 보존해야 하면
  직접 마이그레이션 스크립트를 짜야 함.
- **journal_mode는 WAL이 아니라 기본(DELETE)** — 데이터 파일이 iCloud Drive/OneDrive 같은
  클라우드 동기화 폴더에 놓일 수 있어서, WAL의 `-wal`/`-shm` 사이드카 파일이 따로 동기화되며
  깨질 위험을 피하기 위함. 앱 종료 시 DB 커넥션을 확실히 close.

## 패키징 관련 주의사항

- Apple 개발자 계정 없이 배포하므로 `electron-builder.yml`에서 `mac.identity: null`로 서명을
  건너뛰고, `scripts/afterSign.js`가 빌드 후 자동으로 애드혹 서명(`codesign --sign -`)을 함.
  이게 없으면 패키지된 앱이 실행 즉시 크래시함(EXC_BREAKPOINT).
- **`productName`은 반드시 ASCII만 사용할 것**(현재 `AssetTracker`). 한글 productName으로
  하면 실행파일 이름도 한글이 되면서 앱이 실행 즉시 크래시하는 문제를 겪은 적 있음. 창
  제목/화면 텍스트는 `index.html`의 `<title>`이나 React 컴포넌트에서 한글 그대로 써도 무방.
- Windows 빌드는 이 Mac에서 크로스 빌드하지 말고, git으로 코드를 옮긴 뒤 Windows 데스크탑에서
  직접 `npm install && npm run build:win` (better-sqlite3 네이티브 모듈 재빌드 필요, Visual
  Studio Build Tools의 "Desktop development with C++" 워크로드 필요).

## 데이터 동기화

앱 실행 후 설정 화면에서 데이터 파일 위치를 iCloud Drive/OneDrive 폴더로 지정하면 여러
기기에서 같은 데이터를 볼 수 있음. 단, 두 기기를 동시에 켜놓고 쓰는 상황은 지원하지 않음
(동기화 충돌 감지/해결 로직 없음).
