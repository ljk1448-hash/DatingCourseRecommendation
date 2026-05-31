// 서버 API 클라이언트 (얇은 래퍼). 엔드포인트가 바뀌어도 여기만 수정하면 됨.
export async function getMeta() {
  const r = await fetch("/api/meta");
  if (!r.ok) throw new Error("meta " + r.status);
  return r.json();
}

export async function recommend(body) {
  const r = await fetch("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function swapPlace(body) {
  const r = await fetch("/api/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function regionFromCoords(lat, lng) {
  const r = await fetch(`/api/region-from-coords?lat=${lat}&lng=${lng}`);
  return r.json();
}
