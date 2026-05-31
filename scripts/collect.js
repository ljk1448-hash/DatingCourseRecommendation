// 네이버/카카오 공식 API로 장소를 수집해 data/places.json 을 갱신하는 스크립트.
//
// 실행:  npm run collect
// 키(.env): KAKAO_REST_API_KEY (필수, 장소+좌표)
//           NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (선택, 블로그 후기로 '감성 태그' 자동 부여)
//
// 동작: 카카오로 장소 뼈대를 모으고, 각 장소 이름으로 네이버 블로그를 검색해
//       후기 텍스트를 분석 → 우리 태그로 분류 → 장소에 자동 태그 + 대표 후기 1줄을 붙임.
//       (블로그 원문을 통째로 저장하지 않고, 앱에서 걸러 쓸 수 있게 정제해서 저장)

import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "places.json");

// ─────────────────────────────────────────────────────────────
// 수집 설정: 여기만 바꾸면 원하는 지역/특성을 모을 수 있습니다.
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  // 데이트하기 좋은 권역 단위로 구성 (각 권역은 도보권으로 묶이도록 중심+반경 지정)
  regions: [
    // ── 서울 (주요 데이트 권역) ──
    { name: "서울 성수", center: { lat: 37.5446, lng: 127.0559 }, radius: 2500 },
    { name: "서울 연남·홍대", center: { lat: 37.5585, lng: 126.9255 }, radius: 2500 },
    { name: "서울 강남·신사", center: { lat: 37.5190, lng: 127.0230 }, radius: 2500 },
    { name: "서울 잠실·송파", center: { lat: 37.5095, lng: 127.1000 }, radius: 2500 },
    { name: "서울 이태원·한남", center: { lat: 37.5345, lng: 126.9945 }, radius: 2000 },
    { name: "서울 종로·익선동", center: { lat: 37.5725, lng: 126.9905 }, radius: 2000 },
    { name: "서울 여의도", center: { lat: 37.5258, lng: 126.9270 }, radius: 2500 },
    { name: "서울 망원·합정", center: { lat: 37.5556, lng: 126.9046 }, radius: 2000 },
    { name: "서울 건대입구", center: { lat: 37.5403, lng: 127.0700 }, radius: 2000 },
    // ── 대전 (자치구 단위) ──
    { name: "대전 서구(둔산)", center: { lat: 36.3515, lng: 127.3785 }, radius: 3000 },
    { name: "대전 유성구", center: { lat: 36.3600, lng: 127.3560 }, radius: 4500 },
    { name: "대전 중구(은행·대흥)", center: { lat: 36.3280, lng: 127.4255 }, radius: 2500 },
    { name: "대전 동구(소제·대전역)", center: { lat: 36.3330, lng: 127.4350 }, radius: 2500 },
    { name: "대전 대덕구", center: { lat: 36.3480, lng: 127.4180 }, radius: 3500 },
  ],
  // 검색어 → 우리 카테고리 + 기본 태그
  queries: [
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
  ],
  perQuery: 6,
};

const AVG_MIN = {
  meal: 70, cafe: 50, dessert: 45, bar: 80,
  activity: 80, culture: 80, walk: 60, nightview: 70,
};

const KAKAO_KEY = process.env.KAKAO_REST_API_KEY;
let kakaoErrLogged = false;
const NAVER_ID = process.env.NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET;

// 블로그 후기 텍스트 → 우리 감성 태그 사전
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

// HTML 태그/엔티티 제거
export function stripHtml(s) {
  return (s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

// 텍스트에서 감성 태그 추출 (빈도 상위 max개)
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

// 카카오 키워드 검색 (좌표 포함)
async function kakaoSearch(region, query) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", `${region.name} ${query.q}`);
  url.searchParams.set("x", String(region.center.lng));
  url.searchParams.set("y", String(region.center.lat));
  url.searchParams.set("radius", String(region.radius));
  url.searchParams.set("size", String(CONFIG.perQuery));

  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  if (!res.ok) {
    if (!kakaoErrLogged) {
      kakaoErrLogged = true;
      const body = await res.text().catch(() => "");
      const masked = KAKAO_KEY ? `${KAKAO_KEY.slice(0, 6)}...${KAKAO_KEY.slice(-4)} (길이 ${KAKAO_KEY.length})` : "(없음)";
      console.warn(`  [kakao] 실패 ${res.status} | 사용 키: ${masked}`);
      console.warn(`  [kakao] 응답 본문: ${body.slice(0, 300)}`);
    } else {
      console.warn(`  [kakao] ${query.q} 검색 실패: ${res.status}`);
    }
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
async function naverBlog(name, region) {
  if (!NAVER_ID || !NAVER_SECRET) return null;
  const url = new URL("https://openapi.naver.com/v1/search/blog.json");
  url.searchParams.set("query", `${name} ${region}`);
  url.searchParams.set("display", "5");
  url.searchParams.set("sort", "sim");
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET },
  });
  if (!res.ok) {
    console.warn(`  [naver] ${name} 블로그 검색 실패: ${res.status}`);
    return null;
  }
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

function uniq(arr) {
  return [...new Set(arr)];
}

async function main() {
  if (!KAKAO_KEY) {
    console.log("\n⚠️  KAKAO_REST_API_KEY 가 없어 실데이터 수집을 건너뜁니다.");
    console.log("   .env 에 키를 넣은 뒤 다시 실행하세요. (시드 데이터는 그대로 사용됩니다)\n");
    console.log("   카카오 REST 키: https://developers.kakao.com");
    console.log("   네이버 검색 키: https://developers.naver.com/apps\n");
    return;
  }
  const blogOn = !!(NAVER_ID && NAVER_SECRET);
  console.log(`장소: 카카오  |  블로그 감성태그: ${blogOn ? "네이버 ON" : "OFF(키 없음)"}`);

  const existing = JSON.parse(await readFile(DATA_PATH, "utf-8"));
  const places = existing.places || [];
  const seen = new Set(places.map((p) => `${p.name}|${p.region}`));

  let added = 0, enriched = 0;
  for (const region of CONFIG.regions) {
    console.log(`\n📍 ${region.name} 수집 중...`);
    for (const query of CONFIG.queries) {
      const results = await kakaoSearch(region, query);
      for (const place of results) {
        const key = `${place.name}|${place.region}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (blogOn) {
          const blog = await naverBlog(place.name, region.name);
          if (blog) {
            place.tags = uniq([...place.tags, ...blog.tags]);
            if (blog.snippet || blog.count) {
              place.blog = { snippet: blog.snippet, url: blog.url, count: blog.count };
            }
            if (blog.tags.length) enriched++;
          }
          await new Promise((r) => setTimeout(r, 120));
        }

        places.push(place);
        added++;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  existing.places = places;
  existing.meta = { ...(existing.meta || {}), lastCollectedAt: new Date().toISOString() };
  await writeFile(DATA_PATH, JSON.stringify(existing, null, 2), "utf-8");

  console.log(`\n✅ 완료: 새 장소 ${added}곳 추가${blogOn ? `, 블로그 감성태그 ${enriched}곳` : ""}. 총 ${places.length}곳.`);
  console.log(`   파일: ${DATA_PATH}\n`);
}

// 직접 실행할 때만 main() 수행 (함수 테스트용 import 가능하도록 분리)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => { console.error("수집 중 오류:", err); process.exit(1); });
}
