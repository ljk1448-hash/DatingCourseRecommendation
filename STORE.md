# 스토어 출시 가이드 — 안드로이드(Google Play) & 아이폰(App Store)

이 앱(웹앱/PWA)을 **Capacitor**로 감싸 안드로이드·아이폰 **네이티브 앱**으로 만들고 스토어에 올리는 전 과정입니다.
처음 하는 분 기준으로 순서대로 적었어요. **어려운 단계는 굵게 표시**했습니다.

---

## 0. 큰 그림 (2가지 일)

| 단계 | 하는 일 | 어디서 |
|---|---|---|
| **앱 만들기** | 웹앱을 감싼 앱 파일(AAB/IPA) 빌드 | 내 PC(안드로이드) / 맥(아이폰) |
| **스토어 등록** | 개발자 계정 만들고 앱 제출 | Google Play Console / App Store Connect |

> 핵심: 네이티브 앱 안에는 **화면(web 폴더)만** 들어가고, 실제 검색·추천은 **클라우드 서버(Render)** 가 처리합니다.
> 그래서 **서버가 살아 있어야** 앱이 동작합니다.

---

## 1. 비용 · 준비물 (정직하게)

| 항목 | 안드로이드 | 아이폰 |
|---|---|---|
| 개발자 계정 | Google Play **$25 (평생 1회)** | Apple **$99 / 매년** |
| 빌드 컴퓨터 | **윈도우 OK** | **맥(Mac) 필수** (또는 클라우드 빌드) |
| 필요 도구 | Android Studio (무료) | Xcode (무료, 맥 전용) |
| 심사 기간 | 보통 며칠 | 보통 1~3일 |

공통으로 필요한 것: **앱 아이콘(이미 있음)**, **스크린샷 몇 장**, **앱 설명 글**, **개인정보처리방침 URL(필수)**.

> 맥이 없으면 아이폰은 → ① 클라우드 맥 빌드 서비스(예: **Codemagic**, **Ionic Appflow**), ② 지인 맥 잠깐 빌리기, ③ 맥 대여(월 구독) 중 하나가 필요합니다. 안드로이드부터 출시하고 아이폰은 나중에 해도 됩니다.

---

## 2. 먼저 확인: 서버 주소 & 비밀번호

### (1) 서버 주소
네이티브 앱은 `web/js/config.js` 의 아래 주소로 API를 호출합니다.

```js
const REMOTE_API = "https://date-course-recommender.onrender.com";
```

- Render에 배포한 **실제 주소와 같은지** 확인하세요. 다르면 이 **한 줄만** 바꾸면 됩니다.
- 이 주소를 브라우저로 열어 앱이 뜨면 OK.

### (2) 비밀번호 보호 주의 ⚠️
지금은 `APP_PASSWORD` 로 "나만 쓰기" 잠금이 걸려 있을 수 있습니다.
**스토어 심사자가 앱에 못 들어가면 반려됩니다.** 둘 중 하나를 선택하세요.

- **A. 공개로 전환(권장, 상용화용):** Render → 서비스 → Environment 에서 `APP_PASSWORD` 값을 비워(삭제) 저장. 누구나 쓰는 앱이 됩니다.
- **B. 잠금 유지:** 스토어 심사 제출 시 "심사 노트"에 데모 아이디/비번(`date` / 내가 정한 비번)을 적어 주세요. (단, 앱 첫 화면에 인증창이 떠 사용자 경험은 떨어집니다.)

---

## 3. 로컬 준비 (안드로이드·아이폰 공통)

1. **Node.js 20 이상** 설치 (https://nodejs.org, LTS).
2. 프로젝트 폴더에서:

```bash
npm install
```

3. 아이콘·스플래시 소스는 `resources/` 에 이미 있어요. **아이콘 생성(`npm run cap:assets`)은 플랫폼을 추가한 뒤**(아래 4단계의 `cap:add` 다음) 실행합니다 — 플랫폼이 없으면 에러가 나요.

---

## 4. 안드로이드 앱 만들기 (윈도우에서 가능) 🤖

### 4-1. Android Studio 설치
https://developer.android.com/studio 에서 받아 설치(기본 옵션). 안에 자바(JDK)도 함께 설치됩니다.

### 4-2. 안드로이드 프로젝트 추가
프로젝트 폴더에서:

```bash
npm run cap:add:android     # android 폴더 생성 (최초 1회)
npm run cap:assets          # 앱 아이콘·스플래시 생성 (플랫폼 추가 후!)
npm run cap:sync            # 웹 화면을 앱 안에 복사
npm run cap:open:android    # Android Studio 가 열림
```

### 4-3. 폰에서 테스트
- 안드로이드 폰을 USB로 연결(개발자 옵션·USB 디버깅 켜기) 하거나 에뮬레이터 사용.
- Android Studio 상단 ▶(Run) 버튼 → 앱이 폰에 깔리고 실행됩니다.

### 4-4. 출시용 서명키 만들기 (중요) 🔑
스토어에 올리려면 앱에 "서명"이 필요합니다. 터미널에서:

```bash
keytool -genkey -v -keystore datecourse.keystore -alias datecourse -keyalg RSA -keysize 2048 -validity 10000
```

- 비밀번호와 정보를 입력하면 `datecourse.keystore` 파일이 생깁니다.
- **이 파일과 비밀번호를 절대 잃어버리지 마세요.** 분실하면 **앱 업데이트가 영영 불가**합니다. 안전한 곳에 백업!
- (`.gitignore`에 keystore는 커밋 안 되게 막아뒀습니다.)

### 4-5. AAB(업로드 파일) 빌드
Android Studio 메뉴: **Build → Generate Signed App Bundle / APK → Android App Bundle** 선택 → 위 keystore 지정 → **release** → 빌드.
결과물: `android/app/release/app-release.aab` (이 파일을 스토어에 올립니다).

---

## 5. Google Play 등록 · 제출 🤖

1. **계정 만들기:** https://play.google.com/console → Google 계정 로그인 → **$25 결제**(신용/체크카드, 선불카드 불가) → 본인 확인(신분증).
   - 개인 개발자도 가능. 단, 최근 정책상 **신규 개인 계정은 출시 전 "비공개 테스트(테스터 12~20명, 약 14일)"** 를 요구할 수 있습니다. 화면 안내를 따르세요.
2. **앱 만들기:** 콘솔 → 앱 만들기 → 이름(예: *오늘 우리, 어디 갈까?*), 언어, 무료/유료, 카테고리(여행/라이프스타일).
3. **필수 설문 채우기:** 콘텐츠 등급, 데이터 보안(어떤 개인정보를 쓰는지 — 위치 등), 타깃 연령, 광고 포함 여부.
4. **개인정보처리방침 URL** 입력(필수, 아래 7번 참고).
5. **AAB 업로드:** 프로덕션(또는 먼저 내부 테스트) → 4-5의 `app-release.aab` 업로드.
6. **스토어 등록정보:** 짧은 설명, 자세한 설명, 스크린샷, 아이콘(512), 그래픽 이미지(1024×500).
7. **검토 제출** → 며칠 뒤 게시.

---

## 6. 아이폰 앱 만들기 (맥 필요) 🍎

> 맥이 없다면 이 6·7장 대신 아래 **7-B. 클라우드 빌드(Codemagic)** 로 진행하세요(권장).

> 맥이 없으면 2번 표의 클라우드 빌드 옵션을 쓰세요. 아래는 맥 기준입니다.

### 6-1. Xcode 설치
맥 App Store에서 **Xcode** 설치(무료, 용량 큼).

### 6-2. 아이폰 프로젝트 추가
프로젝트 폴더에서:

```bash
npm run cap:add:ios        # ios 폴더 생성 (최초 1회)
npm run cap:sync
npm run cap:open:ios       # Xcode 가 열림
```

### 6-3. 서명 & 실행
- Xcode → 프로젝트 **Signing & Capabilities** → 본인 **Apple ID(개발자 계정)** 로그인 → "Automatically manage signing" 체크.
- 아이폰 연결 후 ▶ 실행해 테스트.

### 6-4. 업로드용 빌드
Xcode 메뉴: **Product → Archive** → 완료되면 **Distribute App → App Store Connect → Upload**.

---

## 7. App Store Connect 등록 · 제출 🍎

1. **계정:** https://developer.apple.com/programs/enroll → **$99/년** 결제·가입(개인 가능).
2. https://appstoreconnect.apple.com → **My Apps → +** → 앱 생성(이름, 번들 ID `com.ljk1448.datecourse`).
3. **메타데이터:** 설명, 키워드, 스크린샷(여러 기기 크기 — 6.7", 6.5", 5.5" 등), 아이콘.
4. **개인정보 라벨(App Privacy):** 위치 등 수집 항목 표시 + 개인정보처리방침 URL.
5. 6-4에서 올린 빌드 선택 → **심사 제출**.

> ⚠️ **애플 반려 흔한 사유:** "웹사이트를 그대로 감싼, 기능이 빈약한 앱(4.2 Minimum Functionality)". 이 앱은 코스 추천·저장·지도·공유 등 자체 기능이 있으니, 심사 노트에 **"단순 웹뷰가 아니라 추천 엔진·저장·공유 기능을 가진 앱"** 임을 적어두면 좋습니다.

---

## 7-B. 맥이 없다면 — 클라우드 빌드(Codemagic) 🍎☁️

맥 없이 **클라우드 맥**에서 아이폰 앱을 빌드·서명·업로드합니다 (Codemagic 무료 **500분/월**, iOS 빌드 1회 10~20분).
저장소에 **`codemagic.yaml`** 을 이미 넣어뒀어요. 맥/Xcode 설치 불필요, **Apple Developer($99/년)** 만 있으면 됩니다.

### A. 애플 쪽 준비 (맥 불필요)
1. **Apple Developer 가입($99/년):** developer.apple.com → Account → 가입. 개인 인증은 아이폰 *Apple Developer* 앱 또는 웹에서.
2. **App ID(번들 ID) 등록:** developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → ＋ → App IDs → 번들 ID **`com.ljk1448.datecourse`**.
3. **앱 레코드 생성:** appstoreconnect.apple.com → 앱 → ＋ → 위 번들 ID 선택, 이름·SKU 입력.
4. **App Store Connect API 키 발급:** Users and Access → Integrations → App Store Connect API → ＋ → 이름 입력, **App Manager** 권한 → 키 생성 → **.p8 다운로드(1회만!) + Key ID·Issuer ID 메모**.

### B. Codemagic 연결
1. **codemagic.io 가입**(깃허브로 로그인) → 이 저장소를 **Add application** 으로 연결.
2. **Teams/Personal → Integrations → App Store Connect**: 위 `.p8` + Key ID + Issuer ID 등록, 통합 **이름**을 정함(예: `CodemagicASC`).
3. `codemagic.yaml` 의 `app_store_connect: CodemagicASC` 를 그 **이름과 똑같이** 맞춤.
4. 권한 있는 API 키면 인증서·프로필은 **Codemagic가 자동 생성/관리**(자동 서명).

### C. 빌드 & 업로드
1. `git push` → Codemagic 대시보드 → **ios-appstore** 워크플로 → **Start new build**.
2. 10~20분 뒤 IPA 생성 → **TestFlight에 자동 업로드**.
3. App Store Connect → **TestFlight**에서 지인을 이메일/링크로 초대(최대 10,000명) → 베타.
4. 정식 출시: 메타데이터·스크린샷·개인정보 입력 후 **심사 제출**. (`codemagic.yaml`의 `submit_to_app_store` 주석을 풀면 자동 제출)

> 스크린샷은 아이폰에서 캡처하거나 필요한 크기(6.7"·6.5" 등)로 맞추면 됩니다. 인앱 카카오 지도는 네이티브에서 안 뜰 수 있으나 외부 길찾기 링크는 정상 작동해요.

## 8. 스토어 자료 체크리스트 📝

- [ ] 앱 이름 / 짧은 설명(한 줄) / 자세한 설명
- [ ] 스크린샷: 폰에서 실제 화면 캡처 (안드로이드 2장+, 아이폰은 기기별 사이즈)
- [ ] 안드로이드 피처 그래픽 1024×500 (1장)
- [ ] 아이콘 512×512 (이미 `web/icon-512.png` 있음)
- [ ] **개인정보처리방침 URL** — 위치/검색어 등 수집 내용 명시
  - 간단히 만들려면: 무료 생성기(예: app-privacy-policy-generator) 사용 → GitHub Pages나 Notion 공개 페이지에 게시 → 그 URL 사용.
- [ ] 지원(문의) 이메일

---

## 9. 알아둘 제약 & 다음에 다듬을 것

- **Render 무료 서버는 한동안 안 쓰면 잠듭니다.** 앱 첫 실행 시 ~1분 깨우는 시간 → 시작화면(스플래시)이 가려주지만, 상용화 시 유료 플랜 권장.
- **현재 위치(GPS):** 지금은 브라우저 위치기능을 씁니다. 안드로이드 앱에서 권한이 매끄럽지 않으면 `@capacitor/geolocation` 플러그인으로 바꾸면 됩니다. (원하면 추가해 드릴게요.)
- **인앱 카카오 지도:** 카카오 JS 지도는 사용 도메인 등록이 필요해, 네이티브 앱(localhost origin)에선 인앱 지도가 안 뜰 수 있습니다. **"카카오맵에서 열기/길찾기" 같은 외부 링크는 정상 작동**합니다.
- **외부 링크 열기:** 블로그 더보기·공유 링크가 시스템 브라우저에서 열리게 하려면 `@capacitor/browser` 추가를 권장(선택).
- **앱 업데이트:** 코드 고친 뒤 → `npm run cap:sync` → 다시 빌드 → 스토어에 새 버전 업로드. 안드로이드는 **같은 keystore** 로 서명해야 업데이트됩니다.

---

## 10. 명령어 한눈에

```bash
npm install                 # 의존성 설치(최초)

# 안드로이드
npm run cap:add:android     # 최초 1회 (android 폴더 생성)
npm run cap:assets          # 아이콘/스플래시 생성 (반드시 cap:add 다음!)
npm run cap:sync            # 코드 바꿀 때마다
npm run cap:open:android    # Android Studio 열기

# 아이폰 (맥이 있을 때 — 없으면 7-B Codemagic)
npm run cap:add:ios         # 최초 1회
npm run cap:assets          # 아이콘/스플래시 생성
npm run cap:sync
npm run cap:open:ios        # Xcode 열기
```

요약: **안드로이드($25, 윈도우)부터 올리고**, 아이폰($99/년, 맥)은 준비되면 같은 코드로 이어서 하면 됩니다.
