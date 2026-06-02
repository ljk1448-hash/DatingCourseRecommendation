// 카카오/네이버 공식 API 소스 모듈 (라이브 검색 + 사전수집 공용)
// - 지역명(예: "서울 강남구") 기준 카카오 키워드 검색으로 장소를 가져온다.
// - 네이버 블로그 검색으로 후기 텍스트 → 감성 태그 + 대표 후기 1줄을 만든다.

// 데이트 코스에 부적절한 장소 제외 (전시 검색 시 웨딩홀/회의장 등 섞이는 문제)
const BLOCK_KEYWORDS = [
  "웨딩", "예식", "컨벤션", "컨퍼런스", "회의", "연회", "세미나", "장례", "상조", "납골",
  "결혼정보", "부동산", "공인중개", "병원", "의원", "약국", "한의원", "치과", "학원", "고시원",
];
function isBlockedPlace(name, catText) {
  const t = `${name || ""} ${catText || ""}`;
  return BLOCK_KEYWORDS.some((k) => t.includes(k));
}

const AVG_MIN = {
  meal: 70, cafe: 50, dessert: 45, bar: 80,
  activity: 80, culture: 80, walk: 60, nightview: 70,
};

// 검색어 → 우리 카테고리 + 기본 태그
export const QUERIES = [
  { q: "맛집", category: "meal", tags: ["맛집"] },
  { q: "파스타", category: "meal", tags: ["맛집", "데이트분위기"] },
  { q: "고깃집", category: "meal", tags: ["맛집", "활기찬"] },
  { q: "브런치 카페", category: "meal", tags: ["맛집", "분위기좋은"] },
  { q: "분위기 좋은 카페", category: "cafe", tags: ["카페", "분위기좋은"] },
  { q: "베이커리 카페", category: "cafe", tags: ["카페"] },
  { q: "디저트 카페", category: "dessert", tags: ["카페", "사진맛집"] },
  { q: "전시", category: "culture", tags: ["전시/문화", "분위기좋은"] },
  { q: "미술관", category: "culture", tags: ["전시/문화", "조용한"] },
  { q: "공원", category: "walk", tags: ["산책", "조용한"] },
  { q: "산책로", category: "walk", tags: ["산책"] },
  { q: "공방 원데이클래스", category: "activity", tags: ["액티비티", "데이트분위기"] },
  { q: "방탈출카페", category: "activity", tags: ["액티비티", "활기찬"] },
  { q: "와인바", category: "bar", tags: ["데이트분위기", "분위기좋은"] },
  { q: "루프탑 바", category: "bar", tags: ["야경", "데이트분위기"] },
  { q: "야경 명소", category: "nightview", tags: ["야경", "사진맛집"] },
];

// 예산별 검색어 보강 (가격 데이터가 없어 검색 성향으로 근사)
const BUDGET_QUERIES = {
  value: [
    { q: "가성비 맛집", category: "meal", tags: ["맛집", "가성비"] },
    { q: "백반", category: "meal", tags: ["맛집", "가성비"] },
    { q: "분식", category: "meal", tags: ["맛집", "가성비"] },
  ],
  premium: [
    { q: "오마카세", category: "meal", tags: ["맛집", "데이트분위기"] },
    { q: "파인다이닝", category: "meal", tags: ["맛집", "데이트분위기"] },
    { q: "호텔 라운지 카페", category: "cafe", tags: ["카페", "분위기좋은"] },
  ],
};
export function buildQueries(budget) {
  return [...QUERIES, ...(BUDGET_QUERIES[budget] || [])];
}

const TAG_KEYWORDS = {
  분위기좋은: ["분위기", "감성", "아늑", "예쁜", "이쁜", "인테리어", "무드", "고즈넉"],
  데이트분위기: ["데이트", "커플", "기념일", "로맨틱", "프러포즈", "둘이"],
  사진맛집: ["사진", "포토", "인생샷", "인스타", "감성샷", "포토존", "스냅"],
  맛집: ["맛집", "맛있", "존맛", "jmt", "현지인", "웨이팅", "줄서", "재방문"],
  가성비: ["가성비", "저렴", "착한 가격", "혜자", "가격 대비"],
  조용한: ["조용", "한적", "차분", "프라이빗", "널널"],
  활기찬: ["활기", "핫플", "북적", "신나", "인기"],
  야경: ["야경", "노을", "선셋", "일몰", "뷰 맛집", "전망"],
  산책: ["산책", "걷기", "둘레길", "산책로", "걷기 좋", "걷기좋"],
  "전시/문화": ["전시", "갤러리", "미술관", "공연", "문화", "관람"],
  액티비티: ["체험", "클래스", "방탈출", "원데이", "액티비티", "만들기"],
  카페: ["카페", "커피", "라떼", "디저트", "브런치"],
};

export function stripHtml(s) {
  return (s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function classifyTagsFromText(text, max = 4) {
  const t = (text || "").toLowerCase();
  const scores = {};
  for (const [tag, kws] of Object.entries(TAG_KEYWORDS)) {
    let c = 0;
    for (const kw of kws) {
      const re = new RegExp(kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const m = t.match(re);
      if (m) c += m.length;
    }
    if (c > 0) scores[tag] = c;
  }
  return Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, max).map((e) => e[0]);
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}

function refineCategory(intended, groupCode) {
  if (groupCode === "FD6") return "meal";
  if (groupCode === "CE7") return intended === "dessert" ? "dessert" : "cafe";
  if (groupCode === "CT1") return "culture";
  return intended;
}

// 카카오 키워드 검색 (지역명 기준, 좌표 비편향 검색)
export async function kakaoKeyword(regionName, query, kakaoKey, perQuery = 8) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", `${regionName} ${query.q}`);
  url.searchParams.set("size", String(perQuery));
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`kakao ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const district = regionName.split(" ").slice(1).join(" ").trim(); // "유성구" / "춘천시" / "" (시도만)
  return (data.documents || [])
    .filter((d) => {
      if (!district) return true;
      const addr = `${d.road_address_name || ""} ${d.address_name || ""}`;
      return addr.includes(district); // 선택한 구가 아닌 곳(예: 중구) 혼입 방지
    })
    .map((d) => ({
    id: `k-${d.id || slugify(d.place_name)}`,
    name: d.place_name,
    region: regionName,
    category: refineCategory(query.category, d.category_group_code),
    lat: Number(d.y),
    lng: Number(d.x),
    tags: [...query.tags],
    priceLevel: 2,
    avgMinutes: AVG_MIN[query.category] || 60,
    address: d.road_address_name || d.address_name || "",
    description: stripHtml(d.category_name || ""),
    url: d.place_url || "",
    source: "kakao",
  }));
}

// 네이버 블로그 검색 → 감성 태그 + 대표 후기 1줄
export async function naverBlog(name, region, naverId, naverSecret) {
  if (!naverId || !naverSecret) return null;
  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", `${name} ${region}`);
  url.searchParams.set("display", "10");
  url.searchParams.set("sort", "sim");
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": naverId, "X-Naver-Client-Secret": naverSecret },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items = data.items || [];
  const text = items.map((i) => `${stripHtml(i.title)} ${stripHtml(i.description)}`).join(" ");
  const top = items[0];
  return {
    tags: classifyTagsFromText(text),
    snippet: top ? stripHtml(top.description).slice(0, 100) : "",
    url: top ? top.link : "",
    count: data.total || 0,
  };
}

// 한 지역의 장소들을 카카오에서 병렬로 모아 중복 제거
export async function fetchRegionPlaces(regionName, kakaoKey, perQuery = 8, budget = "normal") {
  const queries = buildQueries(budget);
  const batches = await Promise.all(
    queries.map((q) =>
      kakaoKeyword(regionName, q, kakaoKey, perQuery).catch((e) => {
        if (e.status === 401 || e.status === 403) throw e; // 키/권한 문제는 표면화
        return [];
      })
    )
  );
  const seen = new Set();
  const places = [];
  for (const batch of batches) {
    for (const p of batch) {
      if (!p.name || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      if (isBlockedPlace(p.name, p.description || p.categoryName)) continue;
      const key = p.name + "|" + p.address;
      if (seen.has(key)) continue;
      seen.add(key);
      places.push(p);
    }
  }
  return places;
}

// 네이버 이미지 검색 → 장소 대표 썸네일 (출처 링크 포함)
export async function naverImage(query, naverId, naverSecret, matchName) {
  if (!naverId || !naverSecret) return null;
  const url = new URL("https://openapi.naver.com/v1/search/image");
  url.searchParams.set("query", query);
  url.searchParams.set("display", "5");
  url.searchParams.set("sort", "sim");
  url.searchParams.set("filter", "all");
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": naverId, "X-Naver-Client-Secret": naverSecret },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items = data.items || [];
  if (!items.length) return null;
  // 가게명 토큰이 제목에 든 이미지를 우선 채택(엉뚱 사진 방지), 못 찾으면 첫 결과라도 표시
  if (matchName) {
    const norm = (x) => stripHtml(String(x || "")).replace(/[\s·,.\-_/()]+/g, "").toLowerCase();
    const keys = stripHtml(matchName)
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .map((t) => t.replace(/(본점|지점|직영점|\d+호점|점)$/, "")) // 지점/본점 접미사 제거
      .map(norm)
      .filter((k) => k.length >= 2);
    if (keys.length) {
      const hit = items.find((it) => { const t = norm(it.title); return keys.some((k) => t.includes(k)); });
      if (hit) return { thumb: hit.thumbnail || hit.link, link: hit.link };
    }
  }
  const it = items[0];
  return { thumb: it.thumbnail || it.link, link: it.link };
}

// 네이버 지역검색 → 전화번호 (있을 때만)
export async function naverLocal(name, region, naverId, naverSecret) {
  if (!naverId || !naverSecret) return null;
  const url = new URL("https://openapi.naver.com/v1/search/local.json");
  url.searchParams.set("query", `${name} ${region}`);
  url.searchParams.set("display", "1");
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": naverId, "X-Naver-Client-Secret": naverSecret },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const it = (data.items || [])[0];
  if (!it) return null;
  return { phone: (it.telephone || "").trim() };
}

// 좌표 → 행정구역(시/도, 시군구). 카카오 coord2regioncode
export async function kakaoCoord2Region(lat, lng, kakaoKey) {
  const url = new URL("https://dapi.kakao.com/v2/local/geo/coord2regioncode.json");
  url.searchParams.set("x", String(lng));
  url.searchParams.set("y", String(lat));
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  const data = await res.json();
  const docs = data.documents || [];
  const doc = docs.find((d) => d.region_type === "H") || docs[0];
  if (!doc) return null;
  return { sido1: doc.region_1depth_name, region2: doc.region_2depth_name };
}

// ── 내 주변 검색 (좌표 기준 카테고리 검색) ──
// 카카오 카테고리 그룹: FD6 음식점, CE7 카페, CT1 문화시설, AT4 관광명소
export async function kakaoCategory(lat, lng, code, kakaoKey, radius = 1500, size = 15) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/category.json");
  url.searchParams.set("category_group_code", code);
  url.searchParams.set("x", String(lng));
  url.searchParams.set("y", String(lat));
  url.searchParams.set("radius", String(Math.min(Math.max(radius, 100), 20000)));
  url.searchParams.set("sort", "distance");
  url.searchParams.set("size", String(size));
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`kakao ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.documents || [];
}

const NEARBY_CATS = [
  { code: "FD6", category: "meal", tags: ["맛집"] },
  { code: "CE7", category: "cafe", tags: ["카페"] },
  { code: "CT1", category: "culture", tags: ["전시/문화"] },
  { code: "AT4", category: "walk", tags: ["산책", "사진맛집"] },
];

// 현재 좌표 주변의 데이트 장소들을 카테고리별로 모아 거리순 정렬
export async function fetchNearbyPlaces(lat, lng, kakaoKey, radius = 1500) {
  const batches = await Promise.all(
    NEARBY_CATS.map((c) =>
      kakaoCategory(lat, lng, c.code, kakaoKey, radius)
        .then((docs) =>
          docs.map((d) => ({
            id: `k-${d.id || slugify(d.place_name)}`,
            name: d.place_name,
            category: refineCategory(c.category, d.category_group_code),
            categoryName: stripHtml(d.category_name || ""),
            lat: Number(d.y),
            lng: Number(d.x),
            tags: [...c.tags],
            address: d.road_address_name || d.address_name || "",
            phone: (d.phone || "").trim(),
            url: d.place_url || "",
            distance: Number(d.distance) || null,
          }))
        )
        .catch((e) => {
          if (e.status === 401 || e.status === 403) throw e;
          return [];
        })
    )
  );
  const seen = new Set();
  const places = [];
  for (const batch of batches) {
    for (const p of batch) {
      if (!p.name || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      if (isBlockedPlace(p.name, p.description || p.categoryName)) continue;
      const key = p.name + "|" + p.address;
      if (seen.has(key)) continue;
      seen.add(key);
      places.push(p);
    }
  }
  places.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  return places;
}

// 지역명 → 중심 좌표 (수동 '내 주변' 폴백용). 주소검색 우선, 실패 시 키워드검색 첫 결과.
export async function kakaoRegionCenter(regionName, kakaoKey) {
  try {
    const u = new URL("https://dapi.kakao.com/v2/local/search/address.json");
    u.searchParams.set("query", regionName);
    u.searchParams.set("size", "1");
    const r = await fetch(u, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
    if (r.ok) {
      const d = ((await r.json()).documents || [])[0];
      if (d) return { lat: Number(d.y), lng: Number(d.x) };
    }
  } catch {}
  const u2 = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  u2.searchParams.set("query", regionName);
  u2.searchParams.set("size", "1");
  const r2 = await fetch(u2, { headers: { Authorization: `KakaoAK ${kakaoKey}` } });
  if (!r2.ok) { const err = new Error(`kakao ${r2.status}`); err.status = r2.status; throw err; }
  const d2 = ((await r2.json()).documents || [])[0];
  return d2 ? { lat: Number(d2.y), lng: Number(d2.x) } : null;
}
