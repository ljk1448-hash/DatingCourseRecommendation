// 저장 코스 스토리지 (추상화) — 현재 백엔드: 브라우저 localStorage.
// 인터페이스를 async 로 노출해, 향후 서버(API/DB) 백엔드로 그대로 교체 가능하게 한다.
const KEY = "dc.savedCourses.v1";

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 용량초과 등 무시 */ }
}

// 코스 고유 식별자(지역+이동수단+정거장)
export function courseSignature(course) {
  const stops = (course.stops || []).map((s) => s.id || s.name).join(",");
  return `${course.region || ""}|${course.mode || "walk"}|${stops}`;
}

export const savedCourses = {
  async list() { return read(); },
  async count() { return read().length; },
  async has(course) {
    const sig = courseSignature(course);
    return read().some((c) => c.sig === sig);
  },
  // 저장/해제 토글 → 저장되면 true, 해제되면 false
  async toggle(course) {
    const sig = courseSignature(course);
    const list = read();
    const i = list.findIndex((c) => c.sig === sig);
    if (i >= 0) { list.splice(i, 1); write(list); return false; }
    list.unshift({ sig, savedAt: Date.now(), course });
    write(list);
    return true;
  },
  async remove(sig) { write(read().filter((c) => c.sig !== sig)); },
};

// 가본 곳(방문) 저장소 — localStorage. (추천 시 제외용)
const VKEY = "dc.visited.v1";
function vread() { try { return JSON.parse(localStorage.getItem(VKEY)) || []; } catch { return []; } }
function vwrite(l) { try { localStorage.setItem(VKEY, JSON.stringify(l)); } catch { /* 무시 */ } }

export function placeKey(p) { return `${p.name}|${p.region || ""}`; }

export const visitedPlaces = {
  async list() { return vread(); },
  async count() { return vread().length; },
  async keys() { return vread().map((v) => v.key); },
  async has(p) { const k = placeKey(p); return vread().some((v) => v.key === k); },
  async toggle(p) {
    const k = placeKey(p);
    const l = vread();
    const i = l.findIndex((v) => v.key === k);
    if (i >= 0) { l.splice(i, 1); vwrite(l); return false; }
    l.unshift({ key: k, name: p.name, region: p.region || "", at: Date.now() });
    vwrite(l);
    return true;
  },
  async remove(key) { vwrite(vread().filter((v) => v.key !== key)); },
  async clear() { vwrite([]); },
};

// 가보고 싶은 곳(찜) — 가본 곳과 별개의 북마크
const WKEY = "dc.wish.v1";
function wread() { try { return JSON.parse(localStorage.getItem(WKEY)) || []; } catch { return []; } }
function wwrite(l) { try { localStorage.setItem(WKEY, JSON.stringify(l)); } catch { /* 무시 */ } }

export const wishPlaces = {
  async list() { return wread(); },
  async count() { return wread().length; },
  async keys() { return wread().map((v) => v.key); },
  async has(p) { const k = placeKey(p); return wread().some((v) => v.key === k); },
  async toggle(p) {
    const k = placeKey(p);
    const l = wread();
    const i = l.findIndex((v) => v.key === k);
    if (i >= 0) { l.splice(i, 1); wwrite(l); return false; }
    l.unshift({ key: k, name: p.name, region: p.region || "", at: Date.now() });
    wwrite(l);
    return true;
  },
  async remove(key) { wwrite(wread().filter((v) => v.key !== key)); },
  async clear() { wwrite([]); },
};
