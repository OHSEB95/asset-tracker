export function getFirebaseConfig(): { apiKey: string; projectId: string } {
  const apiKey = import.meta.env.MAIN_VITE_FIREBASE_API_KEY
  const projectId = import.meta.env.MAIN_VITE_FIREBASE_PROJECT_ID
  if (!apiKey || !projectId) {
    throw new Error(
      'Firebase 설정이 없습니다. .env 파일에 MAIN_VITE_FIREBASE_API_KEY / MAIN_VITE_FIREBASE_PROJECT_ID를 설정해주세요.'
    )
  }
  return { apiKey, projectId }
}
