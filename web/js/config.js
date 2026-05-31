// 실행 환경에 따른 API 베이스 주소
// - 웹(브라우저로 접속): 같은 서버에서 페이지+API를 함께 주므로 상대경로("") 사용.
// - 네이티브 앱(Capacitor): 페이지는 앱 안에 들어있고 API는 클라우드(Render)에 있으므로 절대 URL 사용.
//
// ▶ 배포 주소가 다르면 아래 REMOTE_API 한 줄만 바꾸면 됩니다.
const REMOTE_API = "https://date-course-recommender.onrender.com";

function isNativeApp() {
  // Capacitor 웹뷰에서 실행 중이면 true
  if (typeof window !== "undefined" && window.Capacitor && typeof window.Capacitor.isNativePlatform === "function") {
    return window.Capacitor.isNativePlatform();
  }
  // 혹시 모를 대비: capacitor:// 또는 file:// 로 열렸을 때
  const p = typeof location !== "undefined" ? location.protocol : "";
  return p === "capacitor:" || p === "ionic:" || p === "file:";
}

export const API_BASE = isNativeApp() ? REMOTE_API : "";
