# 배포 가이드 — Render에 올려서 PC 없이 쓰기

내 컴퓨터를 끄고도 휴대폰에서 접속할 수 있게, 무료 클라우드(Render)에 올리는 방법입니다.
신용카드 없이 가능하고, 코드를 GitHub에 올려두면 Render가 알아서 서버를 실행해 줍니다.

## 1단계. GitHub에 코드 올리기

GitHub 계정이 없으면 먼저 가입하세요 (https://github.com).

이 폴더에서 터미널(또는 Git Bash)을 열고:

```bash
git init
git add .
git commit -m "데이트 코스 추천 앱"
```

GitHub에서 새 저장소(repository)를 만든 뒤, 안내에 나오는 주소로 연결합니다:

```bash
git remote add origin https://github.com/{내아이디}/{저장소이름}.git
git branch -M main
git push -u origin main
```

> `.env`와 `node_modules`는 `.gitignore`에 들어 있어 올라가지 않습니다. (API 키는 코드가 아니라 Render에 따로 넣습니다.)

## 2단계. Render에 배포하기

1. https://render.com 가입 (GitHub 계정으로 로그인하면 편합니다)
2. 대시보드에서 **New +** → **Blueprint** 클릭
3. 방금 올린 GitHub 저장소 선택 → Render가 `render.yaml`을 읽어 설정을 자동으로 잡아줍니다
4. **Apply / Deploy** 클릭 → 몇 분 뒤 `https://date-course-recommender.onrender.com` 같은 주소가 생깁니다

이 주소를 휴대폰에서 열고 브라우저 메뉴의 **홈 화면에 추가**를 누르면 앱처럼 설치돼요.

## 3단계. (선택) API 키 넣기

키가 없어도 시드 데이터로 동작합니다. 실제 장소 수집·AI 멘트를 쓰려면:

Render 대시보드 → 해당 서비스 → **Environment** 탭에서 값을 입력하고 저장하면 자동 재배포됩니다.

- `KAKAO_REST_API_KEY` — 카카오 장소 수집 (https://developers.kakao.com)
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` — 네이버 보강 (https://developers.naver.com/apps)
- `LLM_API_KEY` (필요 시 `LLM_BASE_URL`, `LLM_MODEL`) — AI 추천 멘트

## 알아둘 점

- **무료 플랜은 한동안 접속이 없으면 서버가 잠듭니다.** 다음에 처음 열 때 ~1분쯤 깨어나는 시간이 걸려요. 혼자 가끔 쓰는 용도면 충분합니다.
- **수집한 장소 데이터는 재배포 시 초기화될 수 있어요.** Render 무료는 디스크가 임시라서, 서버에서 `npm run collect`로 모은 결과가 다음 배포 때 사라질 수 있습니다.
  - 권장: 내 PC에서 `npm run collect`를 돌려 `data/places.json`을 채운 뒤 그 파일을 git에 커밋해서 함께 배포하세요. 그러면 항상 그 데이터로 시작합니다.
  - 자주 갱신하고 싶어지면 나중에 간단한 DB로 옮기면 됩니다.
- **비밀번호 보호(나만 쓰기).** Render → Environment 탭에서 `APP_PASSWORD`에 원하는 비밀번호를 넣으면, 접속 시 로그인 창이 뜹니다. 아이디는 기본 `date`(원하면 `APP_USERNAME`으로 변경). 비번을 비워두면 링크를 아는 사람 누구나 접속할 수 있으니, 외부에 올릴 땐 꼭 설정하세요. (휴대폰 브라우저는 한 번 입력하면 기억합니다.)

## 코드 수정 후 반영

GitHub에 푸시만 하면 Render가 자동으로 다시 배포합니다:

```bash
git add .
git commit -m "수정 내용"
git push
```
