// 코스 공유: 네이티브 공유시트(카톡 등) + 이미지 파일 저장/공유 (웹은 폴백)
import { API_BASE } from "./config.js";
import { encodeCourse } from "./storage.js";

const APP_LINK = (API_BASE || (typeof location !== "undefined" ? location.origin : "")) + "/";

export function courseToText(course, region) {
  const lines = course.stops.map((s, i) => `${i + 1}. ${s.name} (${s.categoryLabel})`);
  return `💕 ${course.title}\n${region || ""}\n\n${lines.join("\n")}\n\n이동 약 ${course.totalKm}km\n\n— 오늘 우리, 어디 갈까?`;
}

function capPlugin(name) {
  return (typeof window !== "undefined" && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
}

export async function shareCourse(course, region, url) {
  const text = courseToText(course, region);
  const link = url || `${APP_LINK}?c=${encodeCourse(course)}`;
  const Share = capPlugin("Share");
  if (Share) {
    try { await Share.share({ title: course.title, text: `${text}\n${link}`, url: link, dialogTitle: "코스 공유" }); return "shared"; }
    catch { return "cancel"; }
  }
  if (navigator.share) {
    try { await navigator.share({ title: course.title, text, url: link }); return "shared"; }
    catch { return "cancel"; }
  }
  try { await navigator.clipboard.writeText(`${text}\n${link}`); return "copied"; }
  catch { return "fail"; }
}

let h2cPromise = null;
function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (h2cPromise) return h2cPromise;
  h2cPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => reject(new Error("html2canvas-load-failed"));
    document.head.appendChild(s);
  });
  return h2cPromise;
}

export async function saveCourseImage(el, filename) {
  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas(el, {
    backgroundColor: "#fff6f8",
    scale: 2,
    useCORS: true,
    // 외부 썸네일·액션 버튼은 캡처 제외(캔버스 오염 방지)
    ignoreElements: (node) =>
      node.classList && (node.classList.contains("course-actions") || node.classList.contains("stop-thumb")),
  });
  const dataUrl = canvas.toDataURL("image/png");
  const safe = (filename || "date-course").replace(/[^\w가-힣]+/g, "_");

  const Filesystem = capPlugin("Filesystem");
  const Share = capPlugin("Share");
  if (Filesystem && Share) {
    const base64 = dataUrl.split(",")[1];
    const name = `${safe}-${Date.now()}.png`;
    let uri = null;
    try {
      const w = await Filesystem.writeFile({ path: name, data: base64, directory: "CACHE" });
      uri = (w && w.uri) || null;
      if (!uri) { const g = await Filesystem.getUri({ path: name, directory: "CACHE" }); uri = g.uri; }
    } catch { uri = null; }
    if (uri) {
      try { await Share.share({ title: "데이트 코스", text: "오늘 우리, 어디 갈까? 코스", url: uri, files: [uri], dialogTitle: "이미지 저장/공유" }); return "shared"; }
      catch { return "cancel"; }
    }
  }

  // 웹: 다운로드
  const a = document.createElement("a");
  a.download = `${safe}.png`;
  a.href = dataUrl;
  a.click();
  return "downloaded";
}
