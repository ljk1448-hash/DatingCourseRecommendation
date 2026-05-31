// 클라이언트용 거리/시간 계산 (장소 교체 후 동선 재계산). src/geo.js 와 동일 모델.
const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function travelKm(a, b, f = 1.3) { return haversineKm(a, b) * f; }
export function walkMinutes(km) { return Math.round((km / 4.5) * 60); }
export function driveMinutes(km) { return Math.max(1, Math.round((km / 24) * 60)); }
