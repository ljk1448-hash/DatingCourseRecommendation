// 코스 공유: Web Share API(카톡 등) 텍스트 공유 + html2canvas 이미지 저장
export function courseToText(course, region) {
  const lines = course.stops.map((s, i) => `${i + 1}. ${s.name} (${s.categoryLabel})`);
  return `💕 ${course.title}\n${region || ""}\n\n${lines.join("\n")}\n\n이동 약 ${course.totalKm}km\n\n— 오늘 우리, 어디 갈까?`;
}

export async function shareCourse(course, region, url) {
  const text = courseToText(course, region);
  const link = url || location.href;
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
    // 외부 이미지(썸네일)·액션 버튼은 캡처에서 제외(캔버스 오염/잡음 방지)
    ignoreElements: (node) =>
      node.classList && (node.classList.contains("course-actions") || node.classList.contains("stop-thumb")),
  });
  const a = document.createElement("a");
  a.download = `${filename || "date-course"}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}
