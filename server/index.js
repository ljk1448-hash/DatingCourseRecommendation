import "dotenv/config";
import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { timingSafeEqual, createHash } from "node:crypto";

import { recommendCourses } from "../src/recommend.js";
import { describeCourse, llmEnabled } from "../src/llm.js";
import { fetchRegionPlaces, naverBlog, naverImage, naverLocal, kakaoCoord2Region } from "../src/sources.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_PATH = join(ROOT, "data", "places.json");
const REGIONS_PATH = join(ROOT, "data", "regions.json");

// 고정 특성(분위기) 어휘 — 데이터와 무관하게 칩은 항상 동일하게 제공
const TAG_VOCAB = [
  "분위기좋은", "데이트분위기", "맛집", "카페", "사진맛집", "산책",
  "조용한", "활기찬", "야경", "전시/문화", "액티비티", "가성비",
];

const CATEGORY_LABEL = {
  meal: "식사", cafe: "카페", dessert: "디저트", bar: "술 한잔",
  activity: "액티비티", culture: "전시·문화", walk: "산책", nightview: "야경",
};
// 카카오 행정구역(시/도) → 우리 짧은 이름
const SIDO_NAME_MAP = {
  "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천",
  "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종",
  "경기도": "경기", "강원도": "강원", "강원특별자치도": "강원", "충청북도": "충북", "충청남도": "충남",
  "전라북도": "전북", "전북특별자치도": "전북", "전라남도": "전남",
  "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주",
};

// 시작 시 지역 목록 + (있으면) 사전수집 장소 로드
const regionsData = JSON.parse(await readFile(REGIONS_PATH, "utf-8"));
let localPlaces = [];
try {
  const j = JSON.parse(await readFile(DATA_PATH, "utf-8"));
  localPlaces = j.places || [];
} catch {
  localPlaces = [];
}

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
const NAVER_ID = process.env.NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET;
const liveEnabled = !!KAKAO_KEY;
const naverEnabled = !!(NAVER_ID && NAVER_SECRET);

// 근교(인접 시/도) 확장: 선택 지역의 시/도와 맞닿은 시/도의 대표 도시를 함께 검색
const SIDO_ADJ = {
  "서울": ["경기", "인천"], "인천": ["서울", "경기"],
  "경기": ["서울", "인천", "강원", "충북", "충남"],
  "강원": ["경기", "충북", "경북"],
  "충북": ["경기", "강원", "충남", "대전", "세종", "전북", "경북"],
  "충남": ["경기", "충북", "대전", "세종", "전북"],
  "세종": ["대전", "충북", "충남"], "대전": ["세종", "충북", "충남", "전북"],
  "전북": ["충남", "충북", "대전", "전남", "경남", "경북"],
  "전남": ["전북", "광주", "경남"], "광주": ["전남"],
  "경북": ["강원", "충북", "대구", "경남", "전북"], "대구": ["경북", "경남"],
  "경남": ["부산", "울산", "대구", "경북", "전남", "전북"],
  "부산": ["경남", "울산"], "울산": ["부산", "경남", "경북"], "제주": [],
};
const SIDO_REP = {
  "서울": "서울 중구", "인천": "인천 연수구", "경기": "경기 수원시",
  "강원": "강원 춘천시", "충북": "충북 청주시", "충남": "충남 천안시",
  "세종": "세종 세종시", "대전": "대전 서구", "전북": "전북 전주시",
  "전남": "전남 순천시", "광주": "광주 동구", "경북": "경북 포항시",
  "대구": "대구 중구", "경남": "경남 창원시", "부산": "부산 해운대구",
  "울산": "울산 남구", "제주": "제주 제주시",
};
function neighborRegions(region) {
  const sido = String(region || "").split(" ")[0];
  const reps = (SIDO_ADJ[sido] || []).map((x) => SIDO_REP[x]).filter(Boolean);
  return [...new Set(reps)].filter((r) => r !== region).slice(0, 4);
}

// 지역별 장소 캐시 (라이브 검색 결과 재사용)
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6시간
const regionCache = new Map();

async function getRegionPlaces(regionName, budget = "normal") {
  if (!regionName) return [];
  const cacheKey = `${regionName}|${budget}`;
  const hit = regionCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.places;

  const local = localPlaces.filter((p) => p.region === regionName);
  let places = local;

  if (liveEnabled) {
    const live = await fetchRegionPlaces(regionName, KAKAO_KEY, 8, budget); // 키/권한 오류는 throw
    const seen = new Set(local.map((p) => p.name + "|" + p.address));
    const merged = [...local];
    for (const p of live) {
      const k = p.name + "|" + p.address;
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(p);
    }
    places = merged;
  }

  regionCache.set(cacheKey, { at: Date.now(), places });
  return places;
}

// 코스 장소에 네이버 보강: 블로그 후기/감성태그 + 대표 사진 + 전화번호 (최종 장소만, 캐시)
async function enrichStops(courses, region) {
  if (!naverEnabled) return;
  const cache = new Map();
  const tasks = [];
  for (const c of courses) {
    for (const s of c.stops) {
      tasks.push(
        (async () => {
          const rg = s.region || region;
          const ck = s.name + "|" + rg;
          let data = cache.get(ck);
          if (data === undefined) {
            const [blog, image, local] = await Promise.all([
              naverBlog(s.name, rg, NAVER_ID, NAVER_SECRET),
              naverImage(`${s.name} ${rg}`, NAVER_ID, NAVER_SECRET),
              naverLocal(s.name, rg, NAVER_ID, NAVER_SECRET),
            ]);
            data = { blog, image, local };
            cache.set(ck, data);
          }
          const { blog, image, local } = data;
          if (blog) {
            if (blog.snippet || blog.count) s.blog = { snippet: blog.snippet, url: blog.url, count: blog.count };
            if (blog.tags && blog.tags.length) s.tags = [...new Set([...(s.tags || []), ...blog.tags])];
          }
          if (image && image.thumb) s.image = { thumb: image.thumb, link: image.link };
          if (local && local.phone) s.phone = local.phone;
        })()
      );
    }
  }
  await Promise.all(tasks);
}

// 카테고리별 대략 영업 시간대 (실시간 영업정보가 아닌 추정치)
const OPEN_HOURS = {
  meal: [11, 22], cafe: [9, 22], dessert: [11, 22], bar: [17, 26],
  activity: [10, 22], culture: [10, 18], walk: [6, 22], nightview: [18, 26],
};
function isOpenAt(category, hour) {
  const w = OPEN_HOURS[category];
  if (!w) return true;
  let h = hour;
  if (w[1] > 24 && h < 6) h += 24; // 새벽까지 영업(바/야경)
  return h >= w[0] && h < w[1];
}
function closedCategoriesAt(hour) {
  return Object.keys(OPEN_HOURS).filter((c) => !isOpenAt(c, hour));
}

// 날씨 (Open-Meteo, 키 불필요). 비/눈이면 실외(산책·야경) 제외에 사용.
const weatherCache = new Map();
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
async function getRegionWeather(region, places) {
  const hit = weatherCache.get(region);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return hit.info;
  const pts = (places || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!pts.length) return null;
  const lat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const lng = pts.reduce((a, p) => a + p.lng, 0) / pts.length;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=precipitation,weather_code&timezone=Asia%2FSeoul`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const code = d.current && d.current.weather_code;
    const precip = (d.current && d.current.precipitation) || 0;
    const snow = SNOW_CODES.has(code);
    const rainy = precip > 0 || RAIN_CODES.has(code) || snow;
    const info = { rainy, code, precip, label: snow ? "눈" : rainy ? "비" : "맑음" };
    weatherCache.set(region, { at: Date.now(), info });
    return info;
  } catch {
    return null;
  }
}

// 동시 호출 제한 (여러 지역을 한 번에 검색할 때 과도한 동시요청 방지)
async function mapLimit(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; ret[idx] = await fn(items[idx]); }
  });
  await Promise.all(workers);
  return ret;
}

const app = express();
app.use(express.json());

// 헬스 체크 (인증 면제)
app.get("/healthz", function (req, res) {
  res.status(200).send("ok");
});

// 간단한 비밀번호 보호 (HTTP 기본 인증)
const AUTH_USER = process.env.APP_USERNAME || "date";
const AUTH_PASS = process.env.APP_PASSWORD || "";
function hash(s) { return createHash("sha256").update(String(s)).digest(); }
function safeEqual(a, b) { return timingSafeEqual(hash(a), hash(b)); }
if (AUTH_PASS) {
  app.use(function (req, res, next) {
    const header = req.headers.authorization || "";
    const match = header.match(/^Basic\s+(.+)$/i);
    if (match) {
      const decoded = Buffer.from(match[1], "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      const user = idx >= 0 ? decoded.slice(0, idx) : "";
      const pass = idx >= 0 ? decoded.slice(idx + 1) : "";
      if (safeEqual(user, AUTH_USER) && safeEqual(pass, AUTH_PASS)) return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="date-course", charset="UTF-8"');
    res.status(401).send("authentication required");
  });
}

// 메타: 지역(시/도→시군구) 목록 + 특성 + 기능 상태
app.get("/api/meta", function (req, res) {
  const districtCount = regionsData.sido.reduce((a, s) => a + s.districts.length, 0);
  res.json({
    sido: regionsData.sido,
    sidoCount: regionsData.sido.length,
    districtCount,
    tags: TAG_VOCAB,
    live: liveEnabled,
    naver: naverEnabled,
    llm: llmEnabled(),
    kakaoJsKey: process.env.KAKAO_JS_KEY || null,
  });
});

// 특정 지역 장소
app.get("/api/places", async function (req, res) {
  try {
    const region = req.query.region;
    if (!region) return res.json(localPlaces);
    res.json(await getRegionPlaces(region));
  } catch (err) {
    res.status(502).json({ error: kakaoErrorMessage(err) });
  }
});

// 코스 추천
app.post("/api/recommend", async function (req, res) {
  try {
    const body = req.body || {};
    const region = body.region;
    const tags = body.tags || [];
    const distanceKm = body.distanceKm != null ? body.distanceKm : 5;
    const stops = body.stops != null ? body.stops : 4;
    const includeNight = body.includeNight != null ? body.includeNight : true;
    const mode = body.mode === "car" ? "car" : "walk";
    const nearby = !!body.nearby;
    const budget = ["value", "premium"].includes(body.budget) ? body.budget : "normal";
    const openNow = !!body.openNow;
    const hour = Number.isInteger(body.hour) ? body.hour : new Date().getHours();
    const useWeather = !!body.weather;
    const excludeKeys = Array.isArray(body.excludePlaces) ? body.excludePlaces : [];
    const useLlm = !!body.useLlm;

    const baseRegions = Array.isArray(body.regions) && body.regions.length ? [...new Set(body.regions)] : [region];
    const primary = baseRegions[0];
    let regionsList = [...baseRegions];
    if (nearby) regionsList.push(...neighborRegions(primary));
    regionsList = [...new Set(regionsList)];

    const placeArrays = await mapLimit(regionsList, 4, (rg) => getRegionPlaces(rg, budget));
    const places = placeArrays.flat();
    if (!places.length) {
      return res.json({ region: primary, courses: [], message: liveEnabled ? "이 지역에서 장소를 찾지 못했어요. 다른 지역을 골라보세요." : "서버에 검색 키가 없어 장소를 가져올 수 없어요." });
    }

    // 시간대 + 날씨에 따른 제외 카테고리
    const excludeCategories = new Set();
    if (openNow) closedCategoriesAt(hour).forEach((c) => excludeCategories.add(c));
    let weather = null;
    if (useWeather) {
      weather = await getRegionWeather(primary, places);
      if (weather && weather.rainy) { excludeCategories.add("walk"); excludeCategories.add("nightview"); }
    }

    const result = recommendCourses({
      places, region: primary, regions: regionsList, tags,
      distanceKm: Number(distanceKm), stops: Number(stops),
      includeNight: !!includeNight, mode, budget,
      excludeCategories: [...excludeCategories], excludeKeys,
      seedOffset: Number.isInteger(body.seed) ? body.seed : 0,
      count: 3,
    });
    if (weather) result.weather = weather;

    if (result.courses.length) await enrichStops(result.courses, region);

    if (useLlm && llmEnabled() && result.courses.length) {
      await Promise.all(result.courses.map(async function (c) {
        const text = await describeCourse(c, { region, tags });
        if (text) { c.summary = text; c.llm = true; }
      }));
    }

    res.json(result);
  } catch (err) {
    res.status(502).json({ error: kakaoErrorMessage(err) });
  }
});

function kakaoErrorMessage(err) {
  const m = String(err && err.message || err);
  if (m.includes("401") || m.includes("403")) {
    return "카카오 API 키가 없거나 권한이 없어요. 서버 환경변수 KAKAO_REST_API_KEY 와 카카오맵 활성화를 확인해 주세요.";
  }
  return "장소 검색 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
}

// 장소 바꾸기: 같은 카테고리의 다른 장소 1곳(네이버 보강 포함)
app.post("/api/swap", async function (req, res) {
  try {
    const body = req.body || {};
    const region = body.region;
    const category = body.category;
    const budget = ["value", "premium"].includes(body.budget) ? body.budget : "normal";
    const tags = Array.isArray(body.tags) ? body.tags : [];
    const exclude = new Set(Array.isArray(body.exclude) ? body.exclude : []);
    if (!region || !category) return res.status(400).json({ error: "region·category 가 필요해요." });

    const places = await getRegionPlaces(region, budget);
    const cand = places.filter((p) => p.category === category && !exclude.has(`${p.name}|${p.region}`));
    if (!cand.length) return res.json({ place: null, message: "바꿀 만한 다른 장소가 없어요." });

    const scored = cand
      .map((p) => ({ p, s: (p.tags || []).filter((t) => tags.includes(t)).length }))
      .sort((a, b) => b.s - a.s);
    const top = scored.slice(0, Math.min(5, scored.length));
    const chosen = top[Math.floor(Math.random() * top.length)].p;

    const stop = {
      id: chosen.id, name: chosen.name, region: chosen.region,
      category: chosen.category, categoryLabel: CATEGORY_LABEL[chosen.category] || chosen.category,
      lat: chosen.lat, lng: chosen.lng, tags: [...(chosen.tags || [])],
      address: chosen.address, description: chosen.description, avgMinutes: chosen.avgMinutes || 60,
    };
    await enrichStops([{ stops: [stop] }], region);
    res.json({ place: stop });
  } catch (err) {
    res.status(502).json({ error: kakaoErrorMessage(err) });
  }
});

// 좌표 → 우리 지역(시/도·구) 매핑
app.get("/api/region-from-coords", async function (req, res) {
  try {
    if (!liveEnabled) return res.status(400).json({ error: "서버에 검색 키가 없어요." });
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: "좌표가 올바르지 않아요." });
    const r = await kakaoCoord2Region(lat, lng, KAKAO_KEY);
    if (!r) return res.json({ region: null });
    const sido = SIDO_NAME_MAP[r.sido1] || String(r.sido1 || "").replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
    const sidoObj = regionsData.sido.find((x) => x.name === sido);
    if (!sidoObj) return res.json({ region: null });
    const d2 = r.region2 || "";
    const district = sidoObj.districts.find((d) => d2.includes(d) || (d2 && d.includes(d2))) || sidoObj.districts[0];
    res.json({ sido: sidoObj.name, district, region: `${sidoObj.name} ${district}` });
  } catch (err) {
    res.status(502).json({ error: kakaoErrorMessage(err) });
  }
});

// 프론트엔드 정적 서빙
app.use(express.static(join(ROOT, "web")));

export { app };

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, function () {
    console.log("\n[date-course] server running");
    console.log("   http://localhost:" + PORT);
    console.log("   live(kakao): " + (liveEnabled ? "on" : "off") + " | naver: " + (naverEnabled ? "on" : "off") + " | llm: " + (llmEnabled() ? "on" : "off"));
    console.log("   password protection: " + (AUTH_PASS ? "on (user " + AUTH_USER + ")" : "off"));
  });
}
