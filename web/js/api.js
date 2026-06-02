// 서버 API 클라이언트 (얇은 래퍼). 엔드포인트가 바뀌어도 여기만 수정하면 됨.
// 웹에선 상대경로, 네이티브 앱에선 배포 서버 절대경로(API_BASE) 사용.
import { API_BASE } from "./config.js";

export async function getMeta() {
  const r = await fetch(API_BASE + "/api/meta");
  if (!r.ok) throw new Error("meta " + r.status);
  return r.json();
}

export async function recommend(body) {
  const r = await fetch(API_BASE + "/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function swapPlace(body) {
  const r = await fetch(API_BASE + "/api/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function regionFromCoords(lat, lng) {
  const r = await fetch(`${API_BASE}/api/region-from-coords?lat=${lat}&lng=${lng}`);
  return r.json();
}

export async function nearby(lat, lng, radius) {
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (radius) q.set("radius", String(radius));
  const r = await fetch(`${API_BASE}/api/nearby?${q.toString()}`);
  return r.json();
}

export async function nearbyRegion(region, radius) {
  const q = new URLSearchParams({ region });
  if (radius) q.set("radius", String(radius));
  const r = await fetch(`${API_BASE}/api/nearby?${q.toString()}`);
  return r.json();
}

export async function searchPlaces(q, region) {
  const p = new URLSearchParams({ q });
  if (region) p.set("region", region);
  const r = await fetch(`${API_BASE}/api/place-search?${p.toString()}`);
  return r.json();
}
