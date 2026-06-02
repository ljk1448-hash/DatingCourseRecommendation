// 규칙 기반 데이트 코스 추천 엔진
// - 지역/특성(태그)으로 후보를 거르고
// - "거리 예산(km)"을 조절 knob 으로 삼아 동선을 구성한다.
// - 외부 지도/LLM API 없이도 완결적으로 동작하며, 나중에 실거리/LLM 으로 교체 가능.

import { travelKm, walkMinutes, driveMinutes } from "./geo.js";

// 시작 시간대별 카테고리 순서(phase). 작을수록 앞 단계.
const PHASE_BY_DAYPART = {
  // 오전: 브런치(식사) → 카페/디저트 → 전시·액티비티 → 산책
  morning: { meal: 1, cafe: 2, dessert: 2, activity: 3, culture: 3, walk: 4, nightview: 5, bar: 5 },
  // 오후: 카페·전시 → 액티비티·산책 → 식사(저녁) → 디저트 → 야경·술
  afternoon: { cafe: 1, culture: 1, activity: 2, walk: 2, meal: 3, dessert: 4, nightview: 5, bar: 5 },
  // 저녁: 식사 → 카페/디저트 → 산책·전시 → 야경 → 술 한잔
  evening: { meal: 1, cafe: 2, dessert: 2, walk: 3, culture: 3, activity: 3, nightview: 4, bar: 5 },
};
function phaseMap(daypart) {
  return PHASE_BY_DAYPART[daypart] || PHASE_BY_DAYPART.afternoon;
}

// 카테고리별 한 코스에 들어갈 수 있는 최대 개수
function categoryCaps() {
  // 식사→식사 연속을 막기 위해 식사는 한 코스에 1곳
  return {
    meal: 1,
    cafe: 1,
    dessert: 1,
    activity: 1,
    culture: 1,
    walk: 1,
    nightview: 1,
    bar: 1,
  };
}

const CATEGORY_LABEL = {
  meal: "식사",
  cafe: "카페",
  dessert: "디저트",
  bar: "술 한잔",
  activity: "액티비티",
  culture: "전시·문화",
  walk: "산책",
  nightview: "야경",
};

/** 데이터에서 선택 가능한 지역 목록 */
export function getRegions(places) {
  return [...new Set(places.map((p) => p.region))];
}

/** 데이터에 등장하는 모든 특성(태그) */
export function getTagVocabulary(places) {
  const set = new Set();
  places.forEach((p) => (p.tags || []).forEach((t) => set.add(t)));
  return [...set];
}

/** 원하는 태그와의 일치 점수 */
function matchScore(place, desiredTags, budget = "normal") {
  const tags = place.tags || [];
  let score = 0.5; // 기본 점수(태그가 안 맞아도 동선 채우기용으로 선택 가능)
  for (const t of tags) if (desiredTags.includes(t)) score += 2;
  if (budget === "value" && tags.includes("가성비")) score += 1.2;
  if (budget === "premium" && tags.some((t) => t === "데이트분위기" || t === "분위기좋은")) score += 1.2;
  return score;
}

/** 한 코스를 greedy 로 구성 */
function buildCourse(candidates, { desiredTags, budgetKm, stops, includeNight, seedIndex, mode = "walk", budget = "normal", daypart = "afternoon" }) {
  const caps = categoryCaps();
  const W_MATCH = 2;
  const W_DIST = mode === "car" ? 0.2 : 1.5;

  let pool = candidates
    .filter((p) => (includeNight ? true : !["nightview", "bar"].includes(p.category)))
    .map((p) => ({ ...p, _score: matchScore(p, desiredTags, budget) }));

  if (pool.length === 0) return null;

  // 점수 높은 순 정렬 후 seedIndex 로 시작점 다양화
  pool.sort((a, b) => b._score - a._score || a.id.localeCompare(b.id));
  const seed = pool[seedIndex % pool.length];

  const chosen = [seed];
  const usedCat = { [seed.category]: 1 };
  let totalKm = 0;

  while (chosen.length < stops) {
    const last = chosen[chosen.length - 1];
    let best = null;
    let bestVal = -Infinity;
    let bestKm = 0;

    for (const cand of pool) {
      if (chosen.some((c) => c.id === cand.id)) continue;
      const cnt = usedCat[cand.category] || 0;
      if (cnt >= (caps[cand.category] ?? 1)) continue;

      const km = travelKm(last, cand);
      if (totalKm + km > budgetKm) continue;

      const val = cand._score * W_MATCH - km * W_DIST;
      if (val > bestVal) {
        bestVal = val;
        best = cand;
        bestKm = km;
      }
    }

    if (!best) break; // 예산/후보 소진
    chosen.push(best);
    usedCat[best.category] = (usedCat[best.category] || 0) + 1;
    totalKm += bestKm;
  }

  return orderAndSummarize(chosen, desiredTags, mode, daypart);
}

/** 선택된 장소들을 자연스러운 흐름(phase)으로 재정렬하고 코스 정보 생성 */
function orderAndSummarize(places, desiredTags, mode = "walk", daypart = "afternoon") {
  const PHASE = phaseMap(daypart);
  const ordered = [...places].sort(
    (a, b) => (PHASE[a.category] ?? 9) - (PHASE[b.category] ?? 9)
  );

  const stops = [];
  let totalKm = 0;
  let totalMin = 0;
  let matched = 0;

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i];
    let legKm = 0;
    let legMin = 0;
    if (i > 0) {
      legKm = +travelKm(ordered[i - 1], p).toFixed(2);
      legMin = mode === "car" ? driveMinutes(legKm) : walkMinutes(legKm);
      totalKm += legKm;
      totalMin += legMin;
    }
    totalMin += p.avgMinutes || 60;
    matched += (p.tags || []).filter((t) => desiredTags.includes(t)).length;

    stops.push({
      id: p.id,
      name: p.name,
      region: p.region,
      category: p.category,
      categoryLabel: CATEGORY_LABEL[p.category] || p.category,
      lat: p.lat,
      lng: p.lng,
      tags: p.tags,
      address: p.address,
      description: p.description,
      avgMinutes: p.avgMinutes,
      blog: p.blog || null,
      legKm,
      legMin,
    });
  }

  const vibe = dominantTag(ordered, desiredTags);
  const region = ordered[0]?.region || "";
  const title = `${region} ${vibe} 코스`;

  return {
    title,
    summary: buildRuleSummary(stops, vibe),
    stops,
    totalKm: +totalKm.toFixed(2),
    totalMinutes: totalMin,
    tagsMatched: matched,
    vibe,
    mode,
  };
}

/** 코스를 대표하는 분위기 태그 추출 */
function dominantTag(places, desiredTags) {
  const count = {};
  places.forEach((p) =>
    (p.tags || []).forEach((t) => {
      const w = desiredTags.includes(t) ? 3 : 1;
      count[t] = (count[t] || 0) + w;
    })
  );
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || "데이트";
}

/** 규칙 기반 코스 설명 문구 (LLM 키가 있으면 서버에서 교체) */
function buildRuleSummary(stops, vibe) {
  const flow = stops.map((s) => s.name).join(" → ");
  const totalKm = stops.reduce((a, s) => a + s.legKm, 0).toFixed(1);
  return `${vibe} 분위기로 즐기는 코스예요. ${flow} 순서로 이동하며, 장소 간 이동 거리는 총 약 ${totalKm}km예요.`;
}

/** 코스 식별용 시그니처(중복 제거) */
function signature(course) {
  return course.stops.map((s) => s.id).sort().join("|");
}

/**
 * 추천 코스 목록 생성
 * @param {Object} opts
 * @param {Array}  opts.places          전체 장소 데이터
 * @param {string} opts.region          지역
 * @param {string[]} opts.tags          원하는 특성
 * @param {number} opts.distanceKm      거리 예산(장소 간 이동 합계 상한)
 * @param {number} opts.stops           코스 정거장 수 (기본 4)
 * @param {boolean} opts.includeNight   야경/바 포함 여부
 * @param {number} opts.count           반환할 코스 개수 (기본 3)
 */
export function recommendCourses({
  places,
  region,
  regions,
  tags = [],
  distanceKm = 5,
  stops = 4,
  includeNight = true,
  mode = "walk",
  budget = "normal",
  excludeCategories = [],
  excludeKeys = [],
  seedOffset = 0,
  count = 3,
  daypart = "afternoon",
}) {
  const allow = regions && regions.length ? new Set(regions) : (region ? new Set([region]) : null);
  const exCats = new Set(excludeCategories || []);
  if (daypart === "morning") { exCats.add("nightview"); exCats.add("bar"); } // 오전엔 야경·술 제외
  const exKeys = new Set(excludeKeys || []);
  const candidates = places.filter(
    (p) =>
      (!allow || allow.has(p.region)) &&
      !exCats.has(p.category) &&
      !exKeys.has(`${p.name}|${p.region}`)
  );
  if (candidates.length === 0) {
    return { region, courses: [], message: "해당 지역에 등록된 장소가 없어요." };
  }

  const budgetKm = mode === "car" ? Infinity : distanceKm;
  const courses = [];
  const seen = new Set();
  // 시작점을 바꿔가며 서로 다른 코스를 만든다
  for (let k = 0; k < candidates.length && courses.length < count; k++) {
    const seed = (k + Math.floor(seedOffset)) % candidates.length;
    const course = buildCourse(candidates, {
      desiredTags: tags,
      budgetKm,
      stops,
      includeNight,
      seedIndex: seed,
      mode,
      budget,
      daypart,
    });
    if (!course || course.stops.length < 2) continue;
    const sig = signature(course);
    if (seen.has(sig)) continue;
    seen.add(sig);
    courses.push(course);
  }

  // 태그 일치도 → 이동거리 적은 순으로 정렬
  courses.sort(
    (a, b) => b.tagsMatched - a.tagsMatched || a.totalKm - b.totalKm
  );

  return {
    region,
    requested: { tags, distanceKm, stops, includeNight, mode, budget },
    courses,
    message: courses.length ? null : "조건에 맞는 코스를 찾지 못했어요. 거리를 늘리거나 특성을 줄여보세요.",
  };
}
