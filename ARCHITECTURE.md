# 아키텍처 개요

개인용으로 시작하되 상용화로 확장하기 쉽도록, 책임별로 모듈을 분리하고 "교체 가능한 경계(seam)"를 명확히 두었습니다.

## 폴더 구조

```
data/
  regions.json     전국 시/도 → 시·군·구 목록 (데이터 주도)
  places.json      (선택) 사전수집 장소 — 라이브 모드에선 보조
src/
  geo.js           거리/이동시간 계산 (도보·차량)
  recommend.js     코스 추천 엔진 (순수 함수, 규칙 기반)
  sources.js       카카오/네이버 공식 API 캡슐화 (검색·블로그·태그분류)
  llm.js           (선택) LLM 추천 멘트
server/
  index.js         Express 서버 + API (+ 인증, 캐시, 근교 확장)
scripts/
  collect.js       (선택) 사전수집 배치
web/
  index.html       PWA 진입
  app.js           프론트 오케스트레이터 (ES 모듈)
  js/
    api.js         서버 API 클라이언트
    storage.js     저장 코스 스토리지 (추상화)
    map.js         카카오 지도/길찾기 헬퍼
  styles.css, sw.js, manifest.webmanifest, icon.svg
```

## 데이터 흐름 (추천)

`프론트(app.js) → POST /api/recommend → 서버가 지역(+근교) 장소를 라이브 검색(sources.js, 캐시) → recommend.js 로 코스 구성 → 최종 장소 블로그 보강 → 응답 → 카드/지도/저장 렌더`

## 추천 필터 (요청 파라미터)

`POST /api/recommend` 가 받는 옵션: `tags`, `mode`(walk/car), `distanceKm`, `stops`, `includeNight`, `nearby`, `budget`(value/normal/premium), `openNow`+`hour`(시간대), `weather`(비/눈 시 실외 제외), `excludePlaces`(가본 곳 키 배열).
- 예산: `src/sources.js` 의 `buildQueries(budget)` 가 검색어를 보강(가격 데이터 부재로 성향 근사). 캐시는 `지역|budget` 키.
- 시간대: `server` 의 `OPEN_HOURS`/`closedCategoriesAt(hour)` 로 부적합 카테고리 제외(추정치).
- 날씨: `server` 의 `getRegionWeather()` 가 Open-Meteo(키 불필요) 호출, 30분 캐시. 비/눈이면 walk·nightview 제외.
- 가본 곳: `web/js/storage.js` 의 `visitedPlaces`(localStorage) → 키 배열을 보내 `recommend.js` 가 후보에서 제외. 찜은 `wishPlaces`(별도 북마크).

## 그 외 엔드포인트/모듈
- `POST /api/swap` — 같은 카테고리 대체 장소 1곳(네이버 보강 포함). 클라가 stop 교체 후 `web/js/geo.js` 로 동선 재계산.
- `GET /api/region-from-coords` — 좌표→행정구역(카카오 coord2regioncode)→우리 지역 매핑(현재 위치 자동선택).
- `web/js/share.js` — Web Share API 텍스트 공유 + html2canvas(CDN, cdnjs) 이미지 저장.

## 상용화 시 확장 포인트

- **저장 백엔드 교체**: `web/js/storage.js` 의 `savedCourses` 인터페이스(async)를 유지한 채, localStorage 대신 서버 API/DB 구현으로 교체하면 호출부 수정이 거의 없습니다.
- **계정/인증**: 현재는 단일 비밀번호(HTTP Basic). 다중 사용자로 가려면 `server/index.js` 의 인증 미들웨어를 세션/JWT + 사용자 테이블로 교체합니다.
- **데이터 소스 추가**: 장소·후기 소스는 `src/sources.js` 에 캡슐화되어 있어, 망고플레이트·구글 등 소스를 함수 추가로 확장할 수 있습니다.
- **추천 로직**: `src/recommend.js` 는 입력→출력 순수 함수라, 규칙 가중치 조정이나 ML 랭킹으로 교체가 쉽습니다.
- **지역 데이터**: `data/regions.json` 만 고치면 지역 체계를 바꿀 수 있습니다(코드 무수정).
- **캐시**: 현재 인메모리(`regionCache`, 6h). 다중 인스턴스로 확장 시 Redis 등 외부 캐시로 교체하는 지점입니다.
- **영속성**: 라이브 검색 캐시는 휘발성입니다. 저장/기록/취향학습 등 누적 데이터가 필요해지면 DB(PostgreSQL 등)를 도입하세요.

## 환경변수 (server)

- `KAKAO_REST_API_KEY` (필수, 라이브 검색) / `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` (블로그) / `LLM_API_KEY` (멘트)
- `KAKAO_JS_KEY` (지도 임베드 — 도메인 등록 필요) / `APP_USERNAME`·`APP_PASSWORD` (접근 보호)
