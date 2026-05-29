// 네이버/카카오 공식 API로 장소를 수집해 data/places.json 을 갱신하는 스크립트.
//
// 실행:  npm run collect
// 필요 키(.env): KAKAO_REST_API_KEY (필수, 좌표 제공) / NAVER_CLIENT_ID·NAVER_CLIENT_SECRET (선택, 보강용)
//
// 키가 없으면 안내만 출력하고 종료합니다. 시드 데이터는 그대로 유지됩니다.

import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "places.json");

// ─────────────────────────────────────────────────────────────
// 수집 설정: 여기만 바꾸면 원하는 지역/특성을 모을 수 있습니다.
//  - center: 검색 중심 좌표(위/경도), radius: 반경(m, 최대 20000)
//  - queries: 검색어와 우리 앱의 category/tags 매핑
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  regions: [
    {
      name: "서울 성수",
      center: { lat: 37.5446, lng: 127.0559 },
      radius: 2000,
    },
    {
      name: "서울 연남·홍대",
      center: { lat: 37.5585, lng: 126.9255 },
      radius: 2500,
    },
    {
      name: "대전 둔산·유성",
      center: { lat: 36.3604, lng: 127.378 },
      radius: 6000,
    },
  ],
  queries: [
    { q: "맛집", category: "meal", tags: ["맛집"] },
    { q: "파스타", category: "meal", tags: ["맛집", "데이트분위기"] },
    { q: "브런치 카페", category: "meal", tags: ["맛집", "분위기좋은"] },
    { q: "카페", category: "cafe", tags: ["카페", "분위기좋은"] },
    { q: "디저트 카페", category: "dessert", tags: ["카페", "사진맛집"] },
    { q: "전시", category: "culture", tags: ["전시/문화", "분위기좋은"] },
    { q: "미술관", category: "culture", tags: ["전시/문화", "조용한"] },
    { q: "공원", category: "walk", tags: ["산책", "조용한"] },
    { q: "원데이클래스", category: "activity", tags: ["액티비티", "데이트분위기"] },
    { q: "방탈출", category: "activity", tags: ["액티비티", "활기찬"] },
    { q: "루프탑 바", category: "bar", tags: ["야경", "데이트분위기"] },
    { q: "야경 명소", category: "nightview", tags: ["야경", "사진맛집"] },
  ],
  perQuery: 5, // 검색어당 가져올 최대 장소 수
};

const AVG_MIN = {
  meal: 70,
  cafe: 50,
  dessert: 45,
  bar: 80,
  activity: 80,
  culture: 80,
  walk: 60,
  nightview: 70,
};

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
const NAVER_ID = process.env.NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET;

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

// 카카오 키워드 검색 (좌표 포함)
async function kakaoSearch(region, query) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", `${region.name} ${query.q}`);
  url.searchParams.set("x", String(region.center.lng));
  url.searchParams.set("y", String(region.center.lat));
  url.searchParams.set("radius", String(region.radius));
  url.searchParams.set("size", String(CONFIG.perQuery));

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
  });
  if (!res.ok) {
    console.warn(`  [kakao] ${query.q} 검색 실패: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.documents || []).map((d) => ({
    id: `auto-${slugify(d.place_name)}-${d.id}`,
    name: d.place_name,
    region: region.name,
    category: refineCategory(query.category, d.category_group_code),
    lat: Number(d.y),
    lng: Number(d.x),
    tags: query.tags,
    priceLevel: 2,
    avgMinutes: AVG_MIN[query.category] || 60,
    address: d.road_address_name || d.address_name || "",
    description: d.category_name || "",
    url: d.place_url || "",
    source: "kakao",
  }));
}

// 카카오 카테고리 그룹코드로 식사/카페 구분 보정
function refineCategory(intended, groupCode) {
  if (groupCode === "FD6") return "meal";
  if (groupCode === "CE7") return intended === "dessert" ? "dessert" : "cafe";
  if (groupCode === "CT1") return "culture";
  return intended;
}

// (선택) 네이버 지역검색으로 설명 보강 — 좌표는 카카오 기준 사용
async function naverEnrich(name) {
  if (!NAVER_ID || !NAVER_SECRET) return null;
  const url = new URL("https://openapi.naver.com/v1/search/local.json");
  url.searchParams.set("query", name);
  url.searchParams.set("display", "1");
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_ID,
      "X-Naver-Client-Secret": NAVER_SECRET,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;
  return {
    category: item.category,
    description: item.category?.replace(/>/g, " · "),
  };
}

async function main() {
  if (!KAKAO_KEY) {
    console.log("\n⚠️  KAKAO_REST_API_KEY 가 없어 실데이터 수집을 건너뜁니다.");
    console.log("   .env 에 키를 넣은 뒤 다시 실행하세요. (시드 데이터는 그대로 사용됩니다)\n");
    console.log("   카카오 REST 키 발급: https://developers.kakao.com");
    console.log("   네이버 검색 키 발급: https://developers.naver.com/apps\n");
    return;
  }

  const existing = JSON.parse(await readFile(DATA_PATH, "utf-8"));
  const places = existing.places || [];
  const seen = new Set(places.map((p) => `${p.name}|${p.region}`));

  let added = 0;
  for (const region of CONFIG.regions) {
    console.log(`\n📍 ${region.name} 수집 중...`);
    for (const query of CONFIG.queries) {
      const results = await kakaoSearch(region, query);
      for (const place of results) {
        const key = `${place.name}|${place.region}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const enrich = await naverEnrich(place.name);
        if (enrich?.description) place.description = enrich.description;

        places.push(place);
        added++;
      }
      await new Promise((r) => setTimeout(r, 120)); // 호출 간 짧은 텀
    }
  }

  existing.places = places;
  existing.meta = {
    ...(existing.meta || {}),
    lastCollectedAt: new Date().toISOString(),
  };
  await writeFile(DATA_PATH, JSON.stringify(existing, null, 2), "utf-8");

  console.log(`\n✅ 완료: 새 장소 ${added}곳 추가, 총 ${places.length}곳.`);
  console.log(`   파일: ${DATA_PATH}\n`);
}

main().catch((err) => {
  console.error("수집 중 오류:", err);
  process.exit(1);
});
