// 데이트 코스 추천 - 앱 진입/오케스트레이터 (ES 모듈)
import { getMeta, recommend as apiRecommend, swapPlace, regionFromCoords } from "./js/api.js";
import { savedCourses, visitedPlaces, wishPlaces, courseSignature, placeKey } from "./js/storage.js";
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
};

// 화면에 렌더된 코스를 시그니처로 보관 (저장/지도 버튼에서 조회)
const courseRegistry = new Map();

const $ = (sel) => document.querySelector(sel);

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function distanceText(km) {
  if (km <= 2) return `가깝게 · 약 ${km}km`;
  if (km <= 4) return `도보 중심 · 약 ${km}km`;
  if (km <= 8) return `보통 · 약 ${km}km`;
  if (km <= 13) return `여유롭게 · 약 ${km}km`;
  return `넓게 · 약 ${km}km`;
}

async function init() {
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

  $("#recommendBtn").addEventListener("click", recommend);
  $("#locBtn")?.addEventListener("click", useCurrentLocation);
  $("#randomBtn")?.addEventListener("click", randomRecommend);

  // 전역 액션 위임 (저장/지도/시트 닫기 등)
  document.addEventListener("click", onAction);
  window.addEventListener("popstate", onPopState);
  setActiveTab("home");
  updateSavedCount();
}

function showResultsDom() {
  $("#settingsView").hidden = true;
  document.querySelector(".cta-bar").hidden = true;
  $("#resultsBar").hidden = false;
  document.body.classList.add("results-mode");
  window.scrollTo({ top: 0 });
}
function showSettingsDom() {
  $("#settingsView").hidden = false;
  document.querySelector(".cta-bar").hidden = false;
  $("#resultsBar").hidden = true;
  document.body.classList.remove("results-mode");
  window.scrollTo({ top: 0 });
  setActiveTab("home");
}
function enterResults() {
  if (document.body.classList.contains("results-mode")) return;
  showResultsDom();
  history.pushState({ layer: "results" }, "");
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
  if (!$("#savedPanel").hidden) { $("#savedPanel").hidden = true; setActiveTab("home"); return; }
  if (document.body.classList.contains("results-mode")) { showSettingsDom(); return; }
}
function toggleMore(el) {
  const row = el.closest(".stop-body") && el.closest(".stop-body").querySelector(".stop-more");
  if (row) row.hidden = !row.hidden;
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
        if (state.regions.size > 1) state.regions.delete(full); // 최소 1개 유지
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

async function useCurrentLocation() {
  const btn = $("#locBtn");
  if (!navigator.geolocation) { alert("이 브라우저에선 위치를 쓸 수 없어요."); return; }
  if (btn) { btn.disabled = true; btn.textContent = "📍 찾는 중..."; }
  const done = () => { if (btn) { btn.disabled = false; btn.textContent = "📍 현재 위치"; } };
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const r = await regionFromCoords(pos.coords.latitude, pos.coords.longitude);
      if (r && r.sido && r.district) selectRegion(r.sido, r.district);
      else alert("현재 위치의 지역을 찾지 못했어요. 직접 골라주세요.");
    } catch { alert("지역을 가져오지 못했어요."); }
    finally { done(); }
  }, () => { done(); alert("위치 권한이 필요해요."); }, { timeout: 8000 });
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
  btn.disabled = true;
  results.innerHTML = `<div class="loading"><div class="heart">💗</div>지역을 검색해 코스를 짜는 중...</div>`;
  results.scrollIntoView({ behavior: "smooth", block: "start" });

  const excludePlaces = $("#excludeVisited").checked ? await visitedPlaces.keys() : [];
  const regions = [...state.regions];
  const body = {
    region: regions[0],
    regions,
    tags: [...state.tags],
    mode: state.transport,
    budget: state.budget,
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
        ? `<a class="stop-thumb" href="${s.image.link || s.image.thumb}" target="_blank" rel="noopener"><img src="${s.image.thumb}" alt="${escapeHtml(s.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.stop-thumb')?.remove()"></a>`
        : "";
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
    <p>지도를 표시하려면 카카오 JS 키 설정이 필요해요. 우선 장소 길찾기 링크로 안내할게요.</p>
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
  if (a === "tab-saved") return openSaved();
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
