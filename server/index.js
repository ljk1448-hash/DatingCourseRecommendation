import "dotenv/config";
import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { timingSafeEqual, createHash } from "node:crypto";

import { recommendCourses, getRegions, getTagVocabulary } from "../src/recommend.js";
import { describeCourse, llmEnabled } from "../src/llm.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_PATH = join(ROOT, "data", "places.json");

const app = express();
app.use(express.json());

// 헬스 체크 (인증 면제) — Render 등 배포 플랫폼이 200 을 받도록 인증 미들웨어보다 먼저 둔다.
app.get("/healthz", function (req, res) {
  res.status(200).send("ok");
});

// 간단한 비밀번호 보호 (HTTP 기본 인증)
// APP_PASSWORD 가 설정돼 있을 때만 동작. 비어 있으면(로컬 개발) 누구나 접속 가능.
const AUTH_USER = process.env.APP_USERNAME || "date";
const AUTH_PASS = process.env.APP_PASSWORD || "";

function hash(s) {
  return createHash("sha256").update(String(s)).digest();
}
function safeEqual(a, b) {
  // 길이가 달라도 안전하도록 SHA-256 다이제스트끼리 상수시간 비교
  return timingSafeEqual(hash(a), hash(b));
}

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

// 장소 데이터 로드 (요청 시마다 최신 파일을 읽어 collect 결과를 바로 반영)
async function loadPlaces() {
  const raw = await readFile(DATA_PATH, "utf-8");
  const json = JSON.parse(raw);
  return Array.isArray(json) ? json : json.places || [];
}

// 메타: 지역/특성 목록 + 기능 활성화 상태
app.get("/api/meta", async function (req, res) {
  try {
    const places = await loadPlaces();
    res.json({
      regions: getRegions(places),
      tags: getTagVocabulary(places),
      placeCount: places.length,
      llm: llmEnabled(),
      kakaoJsKey: process.env.KAKAO_JS_KEY || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 전체 장소
app.get("/api/places", async function (req, res) {
  try {
    const places = await loadPlaces();
    const region = req.query.region;
    res.json(region ? places.filter(function (p) { return p.region === region; }) : places);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 코스 추천
app.post("/api/recommend", async function (req, res) {
  try {
    const places = await loadPlaces();
    const body = req.body || {};
    const region = body.region;
    const tags = body.tags || [];
    const distanceKm = body.distanceKm != null ? body.distanceKm : 5;
    const stops = body.stops != null ? body.stops : 4;
    const includeNight = body.includeNight != null ? body.includeNight : true;
    const useLlm = !!body.useLlm;

    const result = recommendCourses({
      places,
      region,
      tags,
      distanceKm: Number(distanceKm),
      stops: Number(stops),
      includeNight: !!includeNight,
      count: 3,
    });

    if (useLlm && llmEnabled() && result.courses.length) {
      await Promise.all(
        result.courses.map(async function (c) {
          const text = await describeCourse(c, { region: region, tags: tags });
          if (text) {
            c.summary = text;
            c.llm = true;
          }
        })
      );
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 프론트엔드 정적 서빙
app.use(express.static(join(ROOT, "web")));

export { app };

// 이 파일을 직접 실행했을 때만 서버를 띄운다 (테스트 시 import 가능하도록 분리)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, function () {
    console.log("\n[date-course] server running");
    console.log("   http://localhost:" + PORT);
    console.log("   LLM: " + (llmEnabled() ? "on" : "off (rule-based text)"));
    console.log("   password protection: " + (AUTH_PASS ? "on (user " + AUTH_USER + ")" : "off"));
  });
}
