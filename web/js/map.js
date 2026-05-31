// 카카오 지도/길찾기 헬퍼. JS 키가 없거나 로드 실패하면 throw → 호출측에서 링크 폴백.
let sdkPromise = null;

function loadSdk(jsKey) {
  if (!jsKey) return Promise.reject(new Error("no-kakao-js-key"));
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${jsKey}&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
    s.onerror = () => reject(new Error("kakao-sdk-load-failed"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// 카카오맵 링크 (앱/웹에서 열림) — SDK 불필요
export function searchUrl(name) {
  return `https://map.kakao.com/link/search/${encodeURIComponent(name)}`;
}
export function directionsUrl(stop) {
  return `https://map.kakao.com/link/to/${encodeURIComponent(stop.name)},${stop.lat},${stop.lng}`;
}

// 컨테이너에 코스(번호 마커 + 동선) 렌더. 좌표/키 문제면 throw.
export async function renderCourseMap(container, course, jsKey) {
  const kakao = await loadSdk(jsKey);
  const valid = (course.stops || []).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (!valid.length) throw new Error("no-coords");

  container.innerHTML = "";
  const path = valid.map((s) => new kakao.maps.LatLng(s.lat, s.lng));
  const map = new kakao.maps.Map(container, { center: path[0], level: 6 });
  const bounds = new kakao.maps.LatLngBounds();

  valid.forEach((s, i) => {
    const pos = new kakao.maps.LatLng(s.lat, s.lng);
    new kakao.maps.Marker({ position: pos, map });
    new kakao.maps.CustomOverlay({ position: pos, yAnchor: 2.1, map, content: `<div class="map-pin">${i + 1}</div>` });
    bounds.extend(pos);
  });
  new kakao.maps.Polyline({ map, path, strokeWeight: 4, strokeColor: "#ff5a7e", strokeOpacity: 0.9 });
  map.setBounds(bounds);
  return map;
}

// 네이버 블로그 검색 결과 페이지 (후기 여러 개) — 키 불필요
export function naverBlogSearchUrl(name, region) {
  const q = `${name} ${region || ""}`.trim();
  return `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(q)}`;
}
