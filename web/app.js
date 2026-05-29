// 데이트 코스 추천 - 프론트엔드 로직

const state = {
  region: null,
  tags: new Set(),
  meta: null,
};

const $ = (sel) => document.querySelector(sel);

// 거리 슬라이더 → 설명 문구
function distanceText(km) {
  if (km <= 2) return `가깝게 · 약 ${km}km`;
  if (km <= 4) return `도보 중심 · 약 ${km}km`;
  if (km <= 8) return `보통 · 약 ${km}km`;
  if (km <= 13) return `여유롭게 · 약 ${km}km`;
  return `넓게(차로) · 약 ${km}km`;
}

async function init() {
  try {
    const res = await fetch("/api/meta");
    state.meta = await res.json();
  } catch {
    $("#results").innerHTML = `<div class="empty">서버에 연결하지 못했어요. 서버를 켰는지 확인해 주세요.</div>`;
    return;
  }

  renderRegions(state.meta.regions);
  renderTags(state.meta.tags);

  if (state.meta.llm) $("#llmRow").hidden = false;

  // 슬라이더 라벨
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

  $("#recommendBtn").addEventListener("click", recommend);
}

function renderRegions(regions) {
  const box = $("#regions");
  box.innerHTML = "";
  regions.forEach((r, i) => {
    const el = document.createElement("div");
    el.className = "chip" + (i === 0 ? " selected" : "");
    el.textContent = r;
    if (i === 0) state.region = r;
    el.addEventListener("click", () => {
      box.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
      el.classList.add("selected");
      state.region = r;
    });
    box.appendChild(el);
  });
}

function renderTags(tags) {
  const box = $("#tags");
  box.innerHTML = "";
  tags.forEach((t) => {
    const el = document.createElement("div");
    el.className = "chip";
    el.textContent = t;
    el.addEventListener("click", () => {
      if (state.tags.has(t)) {
        state.tags.delete(t);
        el.classList.remove("selected");
      } else {
        state.tags.add(t);
        el.classList.add("selected");
      }
    });
    box.appendChild(el);
  });
}

async function recommend() {
  const btn = $("#recommendBtn");
  const results = $("#results");
  btn.disabled = true;
  results.innerHTML = `<div class="loading"><div class="heart">💗</div>코스를 짜는 중...</div>`;
  results.scrollIntoView({ behavior: "smooth", block: "start" });

  const body = {
    region: state.region,
    tags: [...state.tags],
    distanceKm: +$("#distance").value,
    stops: +$("#stops").value,
    includeNight: $("#includeNight").checked,
    useLlm: state.meta?.llm ? $("#useLlm").checked : false,
  };

  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    renderResults(data);
  } catch {
    results.innerHTML = `<div class="empty">추천 중 오류가 발생했어요. 다시 시도해 주세요.</div>`;
  } finally {
    btn.disabled = false;
  }
}

function renderResults(data) {
  const results = $("#results");
  if (!data.courses || data.courses.length === 0) {
    results.innerHTML = `<div class="empty">${data.message || "조건에 맞는 코스를 찾지 못했어요."}</div>`;
    return;
  }

  const head = `<div class="result-head">${data.region} · 추천 코스 ${data.courses.length}개</div>`;
  results.innerHTML = head + data.courses.map(renderCourse).join("");
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCourse(course) {
  const hours = Math.floor(course.totalMinutes / 60);
  const mins = course.totalMinutes % 60;
  const timeText = hours ? `${hours}시간 ${mins ? mins + "분" : ""}`.trim() : `${mins}분`;

  const stops = course.stops
    .map((s, i) => {
      const leg =
        i > 0 && s.legKm
          ? `<div class="leg">이동 약 ${s.legKm}km · 도보 ${s.legMin}분</div>`
          : "";
      const mapUrl = `https://map.kakao.com/link/search/${encodeURIComponent(s.name)}`;
      const tags = (s.tags || []).map((t) => `<span>${t}</span>`).join("");
      return `
        ${leg}
        <div class="stop">
          <div class="stop-rail">
            <div class="stop-dot">${i + 1}</div>
            <div class="stop-line"></div>
          </div>
          <div class="stop-body">
            <div class="stop-cat">${s.categoryLabel}</div>
            <div class="stop-name"><a href="${mapUrl}" target="_blank" rel="noopener">${s.name}</a></div>
            <div class="stop-desc">${s.description || ""}</div>
            <div class="stop-tags">${tags}</div>
          </div>
        </div>`;
    })
    .join("");

  return `
    <div class="course">
      <div class="course-title">${course.title}</div>
      <div class="course-meta">정거장 <b>${course.stops.length}곳</b> · 이동거리 <b>약 ${course.totalKm}km</b> · 예상 <b>${timeText}</b></div>
      <div class="course-summary ${course.llm ? "ai" : ""}">${course.summary}</div>
      <div class="timeline">${stops}</div>
    </div>`;
}

// 서비스 워커 등록 (설치형 PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

init();
