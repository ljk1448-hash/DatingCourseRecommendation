// 데이트 코스 추천 - 앱 진입/오케스트레이터 (ES 모듈)
import { getMeta, recommend as apiRecommend, swapPlace, regionFromCoords, nearby, nearbyRegion } from "./js/api.js";
import { savedCourses, visitedPlaces, wishPlaces, session, courseSignature, placeKey } from "./js/storage.js";
import * as kmap from "./js/map.js";
import * as kgeo from "./js/geo.js";
import * as share from "./js/share.js";

const state = {
  sido: null,
  tags: new Set(),
  transport: "walk",
  budget: "normal",
  regions: new Set(),
  lastBody: null,
  meta: null,
  daypart: "morning",
  nearbyData: null,
  nearbyFilter: "all",
};

// 화면에 렌더된 코스를 시그니처로 보관 (저장/지도 버튼에서 조회)
const courseRegistry = new Map();

const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function catEmoji(cat) {
  return ({ meal: "🍽️", cafe: "☕", dessert: "🍰", bar: "🍷", activity: "🎯", culture: "🎨", walk: "🌳", nightview: "🌃" })[cat] || "📍";
}

function distanceText(km) {
  if (km <= 2) return `가깝게 · 약 ${km}km`;
  if (km <= 4) return `도보 중심 · 약 ${km}km`;
  if (km <= 8) return `보통 · 약 ${km}km`;
  if (km <= 13) return `여유롭게 · 약 ${km}km`;
  return `넓게 · 약 ${km}km`;
}

async function init() {
  requestLocationOnStartup(); // 서버 응답과 무관하게 앱 시작 즉시 권한 요청
  try {
    state.meta = await getMeta();
  } catch {
    $("#results").innerHTML = `<div class="empty">서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.</div>`;
    return;
  }

  renderSido(state.meta.sido || []);
  renderTags(state.meta.tags || []);
  if (state.meta.llm) $("#llmRow").hidden = false;

  const dist = $("#distance");
  const distLabel = $("#distanceLabel");
  const updateDist = () => (distLabel.textContent = distanceText(+dist.value));
  dist.addEventListener("input", updateDist);
  updateDist();

  const stops = $("#stops");
  const stopsLabel = $("#stopsLabel");
  const updateStops = () => (stopsLabel.textContent = `${stops.value}곳`);
  stops.addEventListener("input", updateStops);
  updateStops();

  const transport = $("#transport");
  transport.querySelectorAll(".seg").forEach((b) => {
    b.addEventListener("click", () => {
      transport.querySelectorAll(".seg").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      state.transport = b.dataset.mode;
      $("#distanceField").style.display = state.transport === "car" ? "none" : "";
    });
  });

  const budgetSeg = $("#budget");
  if (budgetSeg) budgetSeg.querySelectorAll(".seg").forEach((b) => {
    b.addEventListener("click", () => {
      budgetSeg.querySelectorAll(".seg").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      state.budget = b.dataset.budget;
    });
  });

  const daypartSeg = $("#daypart");
  if (daypartSeg) {
    daypartSeg.querySelectorAll(".seg").forEach((b) => {
      b.addEventListener("click", () => {
        daypartSeg.querySelectorAll(".seg").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        state.daypart = b.dataset.daypart;
      });
    });
    const initDp = new Date().getHours() < 12 ? "morning" : "afternoon";
    state.daypart = initDp;
    daypartSeg.querySelectorAll(".seg").forEach((b) => b.classList.toggle("selected", b.dataset.daypart === initDp));
  }

  $("#recommendBtn").addEventListener("click", recommend);
  $("#locBtn")?.addEventListener("click", useCurrentLocation);
  $("#randomBtn")?.addEventListener("click", randomRecommend);

  // 전역 액션 위임 (저장/지도/시트 닫기 등)
  document.addEventListener("click", onAction);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  updateOnline();
  setActiveTab("home");
  updateSavedCount();
  await restoreSession();
}

function showResultsDom() {
  $("#settingsView").hidden = true;
  $("#nearbyView").hidden = true;
  $("#results").hidden = false;
  document.querySelector(".cta-bar").hidden = true;
  $("#resultsBar").hidden = false;
  document.body.classList.add("results-mode");
  document.body.classList.remove("nearby-mode");
  window.scrollTo({ top: 0 });
}
function showSettingsDom() {
  $("#settingsView").hidden = false;
  $("#results").hidden = false;
  $("#nearbyView").hidden = true;
  document.querySelector(".cta-bar").hidden = false;
  $("#resultsBar").hidden = true;
  document.body.classList.remove("results-mode");
  document.body.classList.remove("nearby-mode");
  window.scrollTo({ top: 0 });
  setActiveTab("home");
}
function enterResults() {
  if (document.body.classList.contains("results-mode")) return;
  showResultsDom();
  history.pushState({ layer: "results" }, "");
}

// ── 내 주변 ──
const NEAR_FILTERS = [
  { k: "all", label: "전체" },
  { k: "meal", label: "맛집" },
  { k: "cafe", label: "카페" },
  { k: "culture", label: "전시·문화" },
  { k: "walk", label: "명소·산책" },
];
function nearFilterMatch(p) {
  const f = state.nearbyFilter || "all";
  return f === "all" ? true : p.category === f;
}

function showNearbyDom() {
  $("#settingsView").hidden = true;
  $("#results").hidden = true;
  $("#nearbyView").hidden = false;
  document.querySelector(".cta-bar").hidden = true;
  $("#resultsBar").hidden = true;
  document.body.classList.add("nearby-mode");
  document.body.classList.remove("results-mode");
  setActiveTab("nearby");
  window.scrollTo({ top: 0 });
}

async function openNearby() {
  if (document.body.classList.contains("nearby-mode")) return;
  $("#mapModal").hidden = true;
  $("#savedPanel").hidden = true;
  showNearbyDom();
  ensureNearRegionPicker();
  history.pushState({ layer: "nearby" }, "");
  if (state.nearbyData) await renderNearby(state.nearbyData);
  else loadNearby();
}

function loadNearby() {
  const listEl = $("#nearbyList");
  $("#nearbyMap").style.display = "none";
  if (!navigator.onLine) { listEl.innerHTML = `<div class="empty">오프라인이에요. 연결되면 주변을 볼 수 있어요.</div>`; return; }
  listEl.innerHTML = `<div class="loading"><div class="heart">💗</div>내 주변을 찾는 중…</div>`;
  getPosition().then(async (pos) => {
    try {
      const data = await nearby(pos.coords.latitude, pos.coords.longitude);
      if (data && data.error) { listEl.innerHTML = `<div class="empty">${data.error}</div>`; return; }
      state.nearbyData = data;
      await renderNearby(data);
    } catch { listEl.innerHTML = `<div class="empty">주변 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.</div>`; }
  }).catch(() => {
    listEl.innerHTML = `<div class="empty">위치 권한이 필요해요.<br>휴대폰 설정에서 위치 권한을 허용한 뒤 ↻ 새로고침을 눌러주세요.</div>`;
  });
}

async function renderNearby(data) {
  if (!data) return;
  $("#nearbyTitle").textContent = data.region ? `${data.region} 주변` : "내 주변";
  $("#nearbyFilters").innerHTML = NEAR_FILTERS.map((f) =>
    `<button class="nf ${(state.nearbyFilter || "all") === f.k ? "selected" : ""}" type="button" data-action="near-filter" data-k="${f.k}">${f.label}</button>`
  ).join("");

  const items = (data.places || []).filter(nearFilterMatch);
  const mapEl = $("#nearbyMap");
  const key = state.meta?.kakaoJsKey || data.kakaoJsKey;
  if (key && items.length) {
    mapEl.style.display = "";
    kmap.renderNearbyMap(mapEl, data.center, items.slice(0, 30), key).catch(() => { mapEl.style.display = "none"; });
  } else {
    mapEl.style.display = "none";
  }

  const wishKeys = new Set(await wishPlaces.keys());
  const box = $("#nearbyList");
  box.innerHTML = items.length
    ? items.map((p) => nearItemHtml(p, data.region, wishKeys)).join("")
    : `<div class="empty">주변에서 찾은 장소가 없어요.</div>`;
}

function nearItemHtml(p, region, wishKeys) {
  const rg = p.region || region || "";
  const dist = p.distance != null ? (p.distance >= 1000 ? `${(p.distance / 1000).toFixed(1)}km` : `${p.distance}m`) : "";
  const thumb = p.image && p.image.thumb
    ? `<img class="near-thumb" src="${p.image.thumb}" alt="${escapeHtml(p.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;near-thumb ph&quot;>${catEmoji(p.category)}</div>'">`
    : `<div class="near-thumb ph">${catEmoji(p.category)}</div>`;
  const wished = wishKeys ? wishKeys.has(placeKey({ name: p.name, region: rg })) : false;
  const phone = p.phone ? String(p.phone).replace(/[^0-9+\-]/g, "") : "";
  return `<div class="near-item">
    ${thumb}
    <div class="near-body">
      <div class="near-cat">${escapeHtml(p.categoryLabel || "")}${dist ? ` · <span class="near-dist">${dist}</span>` : ""}</div>
      <div class="near-name"><a href="${p.url || kmap.searchUrl(p.name)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a></div>
      <div class="near-addr">${escapeHtml(p.address || p.categoryName || "")}</div>
      <div class="near-actions">
        <a class="act act-go" href="${kmap.directionsUrl(p)}" target="_blank" rel="noopener">🧭 길찾기</a>
        ${phone ? `<a class="act" href="tel:${phone}">📞 전화</a>` : ""}
        <button class="act act-wish ${wished ? "on" : ""}" type="button" data-action="wish" data-name="${escapeHtml(p.name)}" data-region="${escapeHtml(rg)}">${wished ? "💛 찜" : "🤍 찜"}</button>
      </div>
    </div>
  </div>`;
}

function nearbyToCourse() {
  const data = state.nearbyData;
  if (!data || !data.region) { alert("현재 위치의 지역을 찾지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
  const parts = data.region.split(" ");
  selectRegion(parts[0], parts.slice(1).join(" "));
  recommend();
}

// 수동 지역 선택(위치 부정확 대비)
function ensureNearRegionPicker() {
  const sidoSel = $("#nearSido");
  if (!sidoSel || sidoSel.dataset.ready) return;
  const sidos = state.meta?.sido || [];
  sidoSel.innerHTML = sidos.map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join("");
  const fillGu = () => {
    const s = sidos.find((x) => x.name === sidoSel.value) || sidos[0];
    $("#nearGu").innerHTML = ((s && s.districts) || []).map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join("");
  };
  sidoSel.addEventListener("change", fillGu);
  fillGu();
  sidoSel.dataset.ready = "1";
}

async function loadNearbyByRegion(region) {
  const listEl = $("#nearbyList");
  $("#nearbyMap").style.display = "none";
  if (!navigator.onLine) { listEl.innerHTML = `<div class="empty">오프라인이에요. 연결되면 볼 수 있어요.</div>`; return; }
  listEl.innerHTML = `<div class="loading"><div class="heart">💗</div>${escapeHtml(region)} 주변을 찾는 중…</div>`;
  try {
    const data = await nearbyRegion(region);
    if (data && data.error) { listEl.innerHTML = `<div class="empty">${data.error}</div>`; return; }
    if (!data.region) data.region = region;
    state.nearbyData = data;
    await renderNearby(data);
  } catch { listEl.innerHTML = `<div class="empty">주변 정보를 가져오지 못했어요.</div>`; }
}
function setActiveTab(name) {
  document.querySelectorAll(".tabbar .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
}
function goHome() {
  $("#mapModal").hidden = true;
  $("#savedPanel").hidden = true;
  showSettingsDom();
}
// 하드웨어/스와이프 뒤로가기 → 위에 떠 있는 것부터 닫기
function onPopState() {
  if (!$("#mapModal").hidden) { $("#mapModal").hidden = true; return; }
  if (!$("#savedPanel").hidden) { $("#savedPanel").hidden = true; setActiveTab(document.body.classList.contains("nearby-mode") ? "nearby" : "home"); return; }
  if (document.body.classList.contains("results-mode")) { showSettingsDom(); return; }
  if (document.body.classList.contains("nearby-mode")) { showSettingsDom(); return; }
}
function toggleMore(el) {
  const row = el.closest(".stop-body") && el.closest(".stop-body").querySelector(".stop-more");
  if (row) row.hidden = !row.hidden;
}

function updateOnline() {
  const bar = $("#offlineBar");
  if (bar) bar.hidden = navigator.onLine;
}

function skeletonHtml() {
  const card = `<div class="course skel">
    <div class="sk sk-title"></div>
    <div class="sk sk-line"></div>
    <div class="sk sk-block"></div>
    <div class="sk sk-stop"></div><div class="sk sk-stop"></div><div class="sk sk-stop"></div>
  </div>`;
  return `<div class="result-head">지역을 검색해 코스를 짜는 중…</div>` + card + card;
}

function snapshotUI() {
  return {
    regions: [...state.regions],
    tags: [...state.tags],
    transport: state.transport,
    budget: state.budget,
    daypart: state.daypart,
    distance: +$("#distance").value,
    stops: +$("#stops").value,
    includeNight: $("#includeNight").checked,
    nearby: $("#nearby").checked,
    openNow: $("#openNow").checked,
    weather: $("#weather").checked,
    excludeVisited: $("#excludeVisited").checked,
  };
}

function restoreUI(ui) {
  if (!ui) return;
  if (ui.regions && ui.regions.length) {
    const sidoName = ui.regions[0].split(" ")[0];
    const districts = ui.regions.map((r) => r.slice(sidoName.length + 1));
    state.sido = sidoName;
    renderSido(state.meta.sido || [], sidoName, districts);
  }
  if (ui.tags) { state.tags = new Set(ui.tags); syncTagChips(); }
  if (ui.transport) {
    state.transport = ui.transport;
    document.querySelectorAll("#transport .seg").forEach((b) => b.classList.toggle("selected", b.dataset.mode === ui.transport));
    $("#distanceField").style.display = ui.transport === "car" ? "none" : "";
  }
  if (ui.budget) {
    state.budget = ui.budget;
    document.querySelectorAll("#budget .seg").forEach((b) => b.classList.toggle("selected", b.dataset.budget === ui.budget));
  }
  if (ui.daypart) {
    state.daypart = ui.daypart;
    document.querySelectorAll("#daypart .seg").forEach((b) => b.classList.toggle("selected", b.dataset.daypart === ui.daypart));
  }
  if (Number.isFinite(ui.distance)) { const d = $("#distance"); d.value = String(ui.distance); d.dispatchEvent(new Event("input")); }
  if (Number.isFinite(ui.stops)) { const st = $("#stops"); st.value = String(ui.stops); st.dispatchEvent(new Event("input")); }
  if ("includeNight" in ui) $("#includeNight").checked = !!ui.includeNight;
  if ("nearby" in ui) $("#nearby").checked = !!ui.nearby;
  if ("openNow" in ui) $("#openNow").checked = !!ui.openNow;
  if ("weather" in ui) $("#weather").checked = !!ui.weather;
  if ("excludeVisited" in ui) $("#excludeVisited").checked = !!ui.excludeVisited;
}

async function restoreSession() {
  const sv = session.load();
  if (!sv || !sv.ui) return;
  if (Date.now() - (sv.ts || 0) > 24 * 60 * 60 * 1000) return;
  try {
    restoreUI(sv.ui);
    if (sv.data && sv.data.courses && sv.data.courses.length) {
      await renderResults(sv.data);
      enterResults();
    }
  } catch { /* 복원 실패 무시 */ }
}

function renderSido(sidoList, selSido, selDistricts) {
  const box = $("#sido");
  box.innerHTML = "";
  let chosen = null;
  sidoList.forEach((s) => {
    const on = selSido ? s.name === selSido : false;
    const el = document.createElement("div");
    el.className = "chip" + (on ? " selected" : "");
    el.textContent = s.name;
    el.addEventListener("click", () => {
      box.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
      el.classList.add("selected");
      state.sido = s.name;
      renderDistricts(s);
    });
    box.appendChild(el);
    if (on) chosen = s;
  });
  const start = chosen || sidoList[0];
  if (start) {
    if (!chosen) box.querySelector(".chip")?.classList.add("selected");
    state.sido = start.name;
    renderDistricts(start, selDistricts);
  }
}

function renderDistricts(sido, selDistricts) {
  const box = $("#districts");
  box.innerHTML = "";
  const valid = (selDistricts && selDistricts.length ? selDistricts : [sido.districts[0]])
    .filter((d) => sido.districts.includes(d));
  state.regions = new Set((valid.length ? valid : [sido.districts[0]]).map((d) => `${sido.name} ${d}`));

  // 전체 선택 칩
  const allChip = document.createElement("div");
  allChip.className = "chip chip-all";
  allChip.addEventListener("click", () => {
    const allOn = sido.districts.every((d) => state.regions.has(`${sido.name} ${d}`));
    state.regions = allOn
      ? new Set([`${sido.name} ${sido.districts[0]}`])
      : new Set(sido.districts.map((d) => `${sido.name} ${d}`));
    syncDistrictChips(sido);
  });
  box.appendChild(allChip);

  sido.districts.forEach((d) => {
    const full = `${sido.name} ${d}`;
    const el = document.createElement("div");
    el.className = "chip";
    el.dataset.full = full;
    el.textContent = d;
    el.addEventListener("click", () => {
      if (state.regions.has(full)) {
        if (state.regions.size > 1) {
          state.regions.delete(full);
        } else {
          // 마지막 한 곳을 다시 누르면 비우지 않고 '전체'로 전환
          state.regions = new Set(sido.districts.map((dd) => `${sido.name} ${dd}`));
        }
      } else {
        state.regions.add(full);
      }
      syncDistrictChips(sido);
    });
    box.appendChild(el);
  });
  syncDistrictChips(sido);
}

function syncDistrictChips(sido) {
  const box = $("#districts");
  box.querySelectorAll(".chip[data-full]").forEach((el) => {
    el.classList.toggle("selected", state.regions.has(el.dataset.full));
  });
  const allChip = box.querySelector(".chip-all");
  if (allChip) {
    const allOn = sido.districts.every((d) => state.regions.has(`${sido.name} ${d}`));
    allChip.classList.toggle("selected", allOn);
    allChip.textContent = allOn ? "✓ 전체" : "전체";
  }
}

function selectRegion(sido, district) {
  state.sido = sido;
  renderSido(state.meta.sido || [], sido, [district]);
}

// 위치 획득: 네이티브(Capacitor Geolocation) 우선 → 브라우저 폴백
async function getPosition() {
  const G = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
  if (G) {
    try { await G.requestPermissions(); } catch {}
    return await G.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
  }
  if (!navigator.geolocation) throw new Error("no-geolocation");
  return await new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true }));
}

// 앱 첫 실행 시 위치 권한 미리 요청 (네이티브)
async function requestLocationOnStartup() {
  const G = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
  if (!G) return;
  try {
    let perm = null;
    try { perm = await G.checkPermissions(); } catch {}
    const loc = perm && perm.location;
    if (!loc || loc === "prompt" || loc === "prompt-with-rationale") {
      await G.requestPermissions();
    }
  } catch {}
}

async function useCurrentLocation() {
  const btn = $("#locBtn");
  if (btn) { btn.disabled = true; btn.textContent = "📍 찾는 중..."; }
  const done = () => { if (btn) { btn.disabled = false; btn.textContent = "📍 현재 위치"; } };
  try {
    const pos = await getPosition();
    const r = await regionFromCoords(pos.coords.latitude, pos.coords.longitude);
    if (r && r.sido && r.district) selectRegion(r.sido, r.district);
    else alert("현재 위치의 지역을 찾지 못했어요. 직접 골라주세요.");
  } catch {
    alert("위치 권한이 필요해요. 휴대폰 설정 > 앱 권한에서 위치를 허용해 주세요.");
  } finally { done(); }
}

function syncTagChips() {
  $("#tags").querySelectorAll(".chip").forEach((el) => {
    el.classList.toggle("selected", state.tags.has(el.textContent));
  });
}

function randomRecommend() {
  const vocab = state.meta?.tags || [];
  state.tags = new Set();
  const shuffled = [...vocab].sort(() => Math.random() - 0.5);
  const n = 1 + Math.floor(Math.random() * 2);
  shuffled.slice(0, n).forEach((t) => state.tags.add(t));
  syncTagChips();
  state.transport = Math.random() < 0.5 ? "walk" : "car";
  document.querySelectorAll("#transport .seg").forEach((b) => b.classList.toggle("selected", b.dataset.mode === state.transport));
  $("#distanceField").style.display = state.transport === "car" ? "none" : "";
  // 도보면 거리도 무작위(1~14km), 슬라이더/라벨 반영
  if (state.transport === "walk") {
    const dist = $("#distance");
    dist.value = String(1 + Math.floor(Math.random() * 14));
    dist.dispatchEvent(new Event("input"));
  }
  recommend();
}

function renderTags(tags) {
  const box = $("#tags");
  box.innerHTML = "";
  tags.forEach((t) => {
    const el = document.createElement("div");
    el.className = "chip";
    el.textContent = t;
    el.addEventListener("click", () => {
      if (state.tags.has(t)) { state.tags.delete(t); el.classList.remove("selected"); }
      else { state.tags.add(t); el.classList.add("selected"); }
    });
    box.appendChild(el);
  });
}

async function recommend() {
  const btn = $("#recommendBtn");
  const results = $("#results");
  if (!state.regions || state.regions.size === 0) { alert("지역을 한 곳 이상 골라주세요."); return; }
  enterResults();
  if (!navigator.onLine) {
    results.innerHTML = `<div class="empty">오프라인이에요. 인터넷에 연결되면 추천할 수 있어요.<br>저장한 코스는 ♥ 보관함에서 볼 수 있어요.</div>`;
    return;
  }
  btn.disabled = true;
  results.innerHTML = skeletonHtml();
  results.scrollIntoView({ behavior: "smooth", block: "start" });

  const excludePlaces = $("#excludeVisited").checked ? await visitedPlaces.keys() : [];
  const regions = [...state.regions];
  const body = {
    region: regions[0],
    regions,
    tags: [...state.tags],
    mode: state.transport,
    budget: state.budget,
    daypart: state.daypart,
    distanceKm: +$("#distance").value,
    stops: +$("#stops").value,
    includeNight: $("#includeNight").checked,
    nearby: $("#nearby").checked,
    openNow: $("#openNow").checked,
    hour: new Date().getHours(),
    weather: $("#weather").checked,
    seed: Math.floor(Math.random() * 100000),
    excludePlaces,
    useLlm: state.meta?.llm ? $("#useLlm").checked : false,
  };
  state.lastBody = body;

  try {
    const data = await apiRecommend(body);
    await renderResults(data);
    session.save({ ui: snapshotUI(), data });
  } catch {
    results.innerHTML = `<div class="empty">추천 중 오류가 발생했어요. 다시 시도해 주세요.</div>`;
  } finally {
    btn.disabled = false;
  }
}

async function renderResults(data) {
  const results = $("#results");
  if (!data.courses || data.courses.length === 0) {
    results.innerHTML = `<div class="empty">${data.error || data.message || "조건에 맞는 코스를 찾지 못했어요."}</div>`;
    return;
  }
  const savedSigs = new Set((await savedCourses.list()).map((c) => c.sig));
  const visitedKeys = new Set(await visitedPlaces.keys());
  const wishKeys = new Set(await wishPlaces.keys());
  const wx = data.weather
    ? `<span class="wx">${data.weather.label === "맑음" ? "☀️ 맑음" : (data.weather.label === "눈" ? "🌨️ 눈·실내 위주" : "🌧️ 비·실내 위주")}</span>`
    : "";
  const head = `<div class="result-head">${data.region} · 추천 코스 ${data.courses.length}개 ${wx}</div>`;
  results.innerHTML = head + data.courses.map((c) => renderCourse(c, data.region, savedSigs, visitedKeys, wishKeys)).join("");
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCourse(course, homeRegion, savedSigs, visitedKeys, wishKeys) {
  const sig = courseSignature(course);
  courseRegistry.set(sig, course);
  const saved = savedSigs ? savedSigs.has(sig) : false;

  const hours = Math.floor(course.totalMinutes / 60);
  const mins = course.totalMinutes % 60;
  const timeText = hours ? `${hours}시간 ${mins ? mins + "분" : ""}`.trim() : `${mins}분`;

  const stops = course.stops
    .map((s, i) => {
      const leg =
        i > 0 && s.legKm
          ? `<div class="leg">이동 약 ${s.legKm}km · ${course.mode === "car" ? "차량" : "도보"} ${s.legMin}분</div>`
          : "";
      const regionTag = s.region && s.region !== homeRegion ? ` · <span class="stop-region">${s.region}</span>` : "";
      const blog =
        s.blog && s.blog.snippet
          ? `<div class="stop-blog">📝 ${escapeHtml(s.blog.snippet)}…${
              s.blog.url ? ` <a href="${s.blog.url}" target="_blank" rel="noopener">블로그 후기</a>` : ""
            }</div>`
          : "";
      const tags = (s.tags || []).map((t) => `<span>${t}</span>`).join("");
      const visited = visitedKeys ? visitedKeys.has(placeKey({ name: s.name, region: s.region || homeRegion })) : false;
      const wished = wishKeys ? wishKeys.has(placeKey({ name: s.name, region: s.region || homeRegion })) : false;
      const thumb = s.image && s.image.thumb
        ? `<a class="stop-thumb" href="${s.image.link || s.image.thumb}" target="_blank" rel="noopener"><img src="${s.image.thumb}" alt="${escapeHtml(s.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.stop-thumb')?.classList.add('ph'); this.remove();"></a>`
        : `<div class="stop-thumb ph">${catEmoji(s.category)}</div>`;
      const phoneDigits = s.phone ? String(s.phone).replace(/[^0-9+-]/g, "") : "";
      const attrs = `data-name="${escapeHtml(s.name)}" data-region="${escapeHtml(s.region || homeRegion)}"`;
      return `
        ${leg}
        <div class="stop">
          <div class="stop-rail"><div class="stop-dot">${i + 1}</div><div class="stop-line"></div></div>
          <div class="stop-body">
            ${thumb}
            <div class="stop-cat">${s.categoryLabel}${regionTag}</div>
            <div class="stop-name"><a href="${kmap.searchUrl(s.name)}" target="_blank" rel="noopener">${s.name}</a></div>
            <div class="stop-desc">${s.description || ""}</div>
            <div class="stop-tags">${tags}</div>
            ${blog}
            <div class="stop-actions">
              <a class="act act-go" href="${kmap.directionsUrl(s)}" target="_blank" rel="noopener">🧭 길찾기</a>
              <button class="act act-wish ${wished ? "on" : ""}" type="button" data-action="wish" ${attrs}>${wished ? "💛 찜" : "🤍 찜"}</button>
              <button class="act act-more" type="button" data-action="more">⋯</button>
            </div>
            <div class="stop-more" hidden>
              ${phoneDigits ? `<a class="act" href="tel:${phoneDigits}">📞 전화</a>` : ""}
              <a class="act" href="${kmap.naverBlogSearchUrl(s.name, s.region || homeRegion)}" target="_blank" rel="noopener">📝 네이버 후기</a>
              <button class="act ${visited ? "on" : ""}" type="button" data-action="visit" ${attrs}>${visited ? "✓ 다녀옴" : "다녀옴"}</button>
              <button class="act" type="button" data-action="swap" data-sig="${sig}" data-idx="${i}">🔄 바꾸기</button>
            </div>
          </div>
        </div>`;
    })
    .join("");

  return `
    <div class="course" data-sig="${sig}">
      <div class="course-title">${course.title}</div>
      <div class="course-meta">장소 <b>${course.stops.length}곳</b> · 이동거리 <b>약 ${course.totalKm}km</b> · 예상 <b>${timeText}</b></div>
      <div class="course-summary ${course.llm ? "ai" : ""}">${course.summary}</div>
      <div class="timeline">${stops}</div>
      <div class="course-actions">
        <button class="btn-soft" type="button" data-action="map" data-sig="${sig}">🗺️ 지도</button>
        <button class="btn-soft btn-save ${saved ? "on" : ""}" type="button" data-action="save" data-sig="${sig}">${saved ? "♥ 저장됨" : "♡ 저장"}</button>
        <button class="btn-soft" type="button" data-action="share" data-sig="${sig}">📤 공유</button>
        <button class="btn-soft" type="button" data-action="image" data-sig="${sig}">🖼️ 이미지</button>
      </div>
    </div>`;
}

// ── 저장함 ──
async function updateSavedCount() {
  $("#savedCount").textContent = String(await savedCourses.count());
}

async function toggleSave(sig, btn) {
  const course = courseRegistry.get(sig);
  if (!course) return;
  const nowSaved = await savedCourses.toggle(course);
  if (btn) {
    btn.classList.toggle("on", nowSaved);
    btn.textContent = nowSaved ? "♥ 저장됨" : "♡ 저장";
  }
  await updateSavedCount();
  if (!$("#savedPanel").hidden) await renderSaved();
}

async function openSaved() {
  await renderSaved();
  $("#savedPanel").hidden = false;
  setActiveTab("saved");
  history.pushState({ layer: "saved" }, "");
}
function closeSaved() { $("#savedPanel").hidden = true; }

async function renderSaved() {
  const list = await savedCourses.list();
  const visited = await visitedPlaces.list();
  const wish = await wishPlaces.list();
  const box = $("#savedList");
  const sigs = new Set(list.map((c) => c.sig));
  const vkeys = new Set(visited.map((v) => v.key));
  const wkeys = new Set(wish.map((v) => v.key));
  const savedHtml = list.length
    ? list.map((item) => renderCourse(item.course, item.course.region, sigs, vkeys, wkeys)).join("")
    : `<div class="empty">아직 저장한 코스가 없어요. 코스 카드의 ♡ 저장을 눌러보세요.</div>`;
  const section = (title, items, clearAction, unAction) =>
    items.length
      ? `<div class="saved-section"><div class="visited-head"><b>${title} ${items.length}</b><button class="link-btn" type="button" data-action="${clearAction}">모두 비우기</button></div>` +
        items.map((v) => `<div class="visited-row"><span>${escapeHtml(v.name)}<small> · ${escapeHtml(v.region)}</small></span><button class="x" type="button" data-action="${unAction}" data-key="${escapeHtml(v.key)}">✕</button></div>`).join("") +
        `</div>`
      : "";
  box.innerHTML = savedHtml + section("가본 곳", visited, "clear-visited", "unvisit") + section("가보고 싶은 곳", wish, "clear-wish", "unwish");
}

// ── 지도 ──
async function openMap(sig) {
  const course = courseRegistry.get(sig);
  if (!course) return;
  $("#mapTitle").textContent = course.title || "코스 지도";
  const container = $("#mapContainer");
  $("#mapModal").hidden = false;
  history.pushState({ layer: "map" }, "");
  const key = state.meta?.kakaoJsKey;
  try {
    await kmap.renderCourseMap(container, course, key);
  } catch {
    container.innerHTML = mapFallbackHtml(course);
  }
}
function closeMap() { $("#mapModal").hidden = true; }

function mapFallbackHtml(course) {
  const items = course.stops
    .map((s, i) => `<li>${i + 1}. ${s.name} <a href="${kmap.directionsUrl(s)}" target="_blank" rel="noopener">길찾기</a></li>`)
    .join("");
  return `<div class="map-fallback">
    <p>아래 <b>길찾기</b>를 누르면 카카오맵 앱에서 위치와 경로를 볼 수 있어요.</p>
    <ol>${items}</ol>
  </div>`;
}

// 전역 액션 위임
function onAction(e) {
  if (e.target.id === "savedPanel") return history.back();
  if (e.target.id === "mapModal") return history.back();
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const a = el.dataset.action;
  if (a === "open-saved") return openSaved();
  if (a === "close-saved") return history.back();
  if (a === "close-map") return history.back();
  if (a === "save") return toggleSave(el.dataset.sig, el);
  if (a === "map") return openMap(el.dataset.sig);
  if (a === "visit") return toggleVisit(el);
  if (a === "unvisit") return unvisit(el.dataset.key);
  if (a === "clear-visited") return clearVisited();
  if (a === "share") return shareCourseAction(el.dataset.sig);
  if (a === "image") return imageCourseAction(el.dataset.sig, el);
  if (a === "swap") return swapStop(el.dataset.sig, Number(el.dataset.idx), el);
  if (a === "wish") return toggleWish(el);
  if (a === "unwish") return unwish(el.dataset.key);
  if (a === "clear-wish") return clearWish();
  if (a === "back-settings") return history.back();
  if (a === "redo") return recommend();
  if (a === "tab-home") return goHome();
  if (a === "tab-nearby") return openNearby();
  if (a === "tab-saved") return openSaved();
  if (a === "nearby-refresh") { state.nearbyData = null; return loadNearby(); }
  if (a === "near-filter") { state.nearbyFilter = el.dataset.k; return renderNearby(state.nearbyData); }
  if (a === "near-course") return nearbyToCourse();
  if (a === "near-region-toggle") { const pk = $("#nearRegionPicker"); pk.hidden = !pk.hidden; return; }
  if (a === "near-region-go") { return loadNearbyByRegion(`${$("#nearSido").value} ${$("#nearGu").value}`.trim()); }
  if (a === "more") return toggleMore(el);
}

async function toggleVisit(el) {
  const now = await visitedPlaces.toggle({ name: el.dataset.name, region: el.dataset.region });
  el.classList.toggle("on", now);
  el.textContent = now ? "✓ 다녀옴" : "다녀옴";
  if (!$("#savedPanel").hidden) await renderSaved();
}
async function unvisit(key) { await visitedPlaces.remove(key); await renderSaved(); }
async function clearVisited() { await visitedPlaces.clear(); await renderSaved(); }

// ── 공유 / 이미지 ──
async function shareCourseAction(sig) {
  const course = courseRegistry.get(sig);
  if (!course) return;
  const res = await share.shareCourse(course, course.stops[0] && course.stops[0].region);
  if (res === "copied") alert("코스를 클립보드에 복사했어요. 붙여넣어 보내세요!");
}
async function imageCourseAction(sig, btn) {
  const el = document.querySelector(`.course[data-sig="${sig}"]`);
  if (!el) return;
  const prev = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "만드는 중..."; }
  try {
    const course = courseRegistry.get(sig);
    await share.saveCourseImage(el, (course && course.title) || "date-course");
  } catch { alert("이미지를 만들지 못했어요."); }
  finally { if (btn) { btn.disabled = false; btn.textContent = prev; } }
}

// ── 장소 바꾸기 ──
async function swapStop(sig, idx, btn) {
  const course = courseRegistry.get(sig);
  if (!course || !course.stops[idx]) return;
  const stop = course.stops[idx];
  const b = state.lastBody || {};
  if (btn) { btn.disabled = true; btn.textContent = "바꾸는 중..."; }
  try {
    const r = await swapPlace({
      region: stop.region || b.region,
      category: stop.category,
      budget: b.budget || "normal",
      tags: b.tags || [],
      exclude: course.stops.map((x) => placeKey({ name: x.name, region: x.region })),
    });
    if (r && r.place) {
      course.stops[idx] = { ...r.place, legKm: 0, legMin: 0 };
      recomputeCourse(course);
      await rerenderCourse(sig);
    } else {
      alert((r && r.message) || "바꿀 장소가 없어요.");
    }
  } catch { alert("교체 중 오류가 났어요."); }
  finally { if (btn) { btn.disabled = false; btn.textContent = "🔄 바꾸기"; } }
}
function recomputeCourse(course) {
  let totalKm = 0, totalMin = 0;
  course.stops.forEach((s, i) => {
    if (i > 0) {
      const km = +kgeo.travelKm(course.stops[i - 1], s).toFixed(2);
      s.legKm = km;
      s.legMin = course.mode === "car" ? kgeo.driveMinutes(km) : kgeo.walkMinutes(km);
      totalKm += km; totalMin += s.legMin;
    } else { s.legKm = 0; s.legMin = 0; }
    totalMin += s.avgMinutes || 60;
  });
  course.totalKm = +totalKm.toFixed(2);
  course.totalMinutes = totalMin;
}
async function rerenderCourse(sig) {
  const el = document.querySelector(`.course[data-sig="${sig}"]`);
  if (!el) return;
  const course = courseRegistry.get(sig);
  const savedSigs = new Set((await savedCourses.list()).map((c) => c.sig));
  const visitedKeys = new Set(await visitedPlaces.keys());
  const wishKeys = new Set(await wishPlaces.keys());
  const wrap = document.createElement("div");
  wrap.innerHTML = renderCourse(course, course.stops[0] && course.stops[0].region, savedSigs, visitedKeys, wishKeys);
  if (wrap.firstElementChild) el.replaceWith(wrap.firstElementChild);
}

// ── 찜(가보고 싶은 곳) ──
async function toggleWish(el) {
  const now = await wishPlaces.toggle({ name: el.dataset.name, region: el.dataset.region });
  el.classList.toggle("on", now);
  el.textContent = now ? "💛 찜" : "🤍 찜";
  if (!$("#savedPanel").hidden) await renderSaved();
}
async function unwish(key) { await wishPlaces.remove(key); await renderSaved(); }
async function clearWish() { await wishPlaces.clear(); await renderSaved(); }

// 서비스 워커 등록 (설치형 PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

init();
