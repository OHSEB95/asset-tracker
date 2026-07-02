const { execFileSync } = require('node:child_process')
const path = require('node:path')

// electron-builder는 identity: null일 때 서명을 완전히 건너뛰는데, 그 상태로 패키징된
// 앱은 중첩된 Frameworks/Helper 앱들의 서명이 깨진 채로 남아 실행 시 즉시 크래시한다
// (EXC_BREAKPOINT/SIGTRAP). 빌드 후 애드혹 서명("-")으로 전체 번들을 다시 서명해야
// macOS에서 정상 실행된다. 유료 Apple Developer 인증서가 없는 개인용 앱이므로
// Gatekeeper 미검증 경고(우클릭 후 "열기")는 정상이며 별도 안내로 대응한다.
module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)

  execFileSync('codesign', ['--remove-signature', appPath])
  execFileSync('codesign', ['--deep', '--force', '--sign', '-', appPath])
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath])
}
