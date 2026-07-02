# 자산 관리 (Asset Tracker)

비트코인, IRP, ISA, 연금저축펀드, 해외주식, 국내주식, 청년도약계좌 등 여러 계좌의
월별 납입액·배당·매도손익·평가금액을 입력하고, 원금 대비 자산이 어떻게 불어나는지
차트로 보여주는 개인용 데스크탑 앱입니다.

## 개발 모드 실행

```bash
npm install
npm run dev
```

## macOS 빌드

```bash
npm run build:mac
```

`dist/AssetTracker-<version>-arm64.dmg` 가 생성됩니다. Apple 개발자 계정으로 서명된
빌드가 아니므로(개인용 앱), 다운로드 후 처음 열 때 Gatekeeper가 "확인되지 않은 개발자"
경고를 띄울 수 있습니다. 이 경우 Finder에서 앱을 우클릭 → "열기"를 선택하면 실행됩니다.

## Windows 빌드

better-sqlite3가 네이티브 모듈이라 macOS에서 Windows용으로 크로스 빌드하는 것은
안정적이지 않습니다. 코드는 git으로 옮기고, Windows 데스크탑에서 직접 빌드하세요.

1. Windows에 [Node.js](https://nodejs.org) 설치
2. Visual Studio Build Tools에서 "Desktop development with C++" 워크로드 설치
   (better-sqlite3 네이티브 재빌드에 필요)
3. 이 저장소를 clone
4. `npm install && npm run build:win`

즉, **git은 코드를 동기화**하고, **iCloud Drive / OneDrive는 데이터 파일을 동기화**하는
용도로 역할이 나뉩니다.

## 데이터 위치 (맥북 ↔ 데스크탑 동기화)

앱 실행 후 설정 화면에서 "폴더 선택/변경"을 눌러 iCloud Drive 또는 OneDrive 안의
폴더를 데이터 저장 위치로 지정하면, 두 기기에서 같은 데이터를 볼 수 있습니다.
(두 기기를 동시에 켜놓고 쓰는 상황은 피해주세요 — 동기화 충돌 대비 로직은 없습니다.)
