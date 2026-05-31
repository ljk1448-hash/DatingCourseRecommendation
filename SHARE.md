# 심사 없이 지인에게 먼저 써보게 하기 (베타 배포)

스토어 심사·등록 전에, 친구·지인에게 링크로 보내 먼저 써보게 하는 방법입니다.
**다운로드 페이지**(`web/download.html`)가 휴대폰 종류를 자동으로 알아보고 안내해줘요.

- **공유 주소:** `https://date-course-recommender.onrender.com/download.html`
- **QR 이미지:** `web/download-qr.png` (카톡·인스타로 이미지 한 장 보내면 끝)

> 플랫폼 차이를 먼저 알아두세요.
> - **안드로이드** = APK 파일을 직접 받아 설치(무료·무계정·무심사). ✅
> - **아이폰** = 애플이 외부 앱 설치를 막아서, **Safari "홈 화면에 추가"(PWA)** 가 무료 길이에요. 진짜 앱으로 주려면 TestFlight($99/년+맥)이 필요합니다.

---

## 0. 먼저: 비밀번호 끄기 (중요) ⚠️

지인이 쓰려면 앱이 **공개**여야 해요. Render → 서비스 → **Environment** 에서 `APP_PASSWORD` 값을 **비우고 저장**하세요.
(다운로드 페이지·APK·QR은 비번이 있어도 열리지만, **앱 본체와 검색 기능은 비번을 끄지 않으면 친구가 못 씁니다.**)

---

## 1. 안드로이드 — APK 만들어 공유 🤖

### 1-1. APK 빌드
Android Studio에서 프로젝트를 연 뒤(→ [STORE.md](STORE.md)의 4번 참고):

- **가장 빠른 방법(서명키 불필요, 테스트용):** 메뉴 **Build → Build Bundle(s)/APK(s) → Build APK(s)**
  → 생기는 `app-debug.apk` 를 그대로 나눠줘도 설치됩니다.
- **정식(권장, 릴리스 서명):** [STORE.md](STORE.md) 4-4·4-5의 keystore로 서명한 `app-release.apk`.

### 1-2. APK 올리기 — 둘 중 하나
**(A) 가장 쉬움 — 앱 서버에 같이 올리기**
1. 만든 APK 파일 이름을 **`app-release.apk`** 로 바꿔요.
2. 그 파일을 프로젝트의 **`web/`** 폴더에 넣어요.
3. `git add . && git commit -m "apk" && git push` → Render가 자동 배포.
4. 끝! 다운로드 페이지의 “⬇️ 앱 다운로드” 버튼이 바로 작동해요. (`https://.../app-release.apk`)

**(B) GitHub Releases (저장소를 가볍게 유지하고 싶을 때)**
1. GitHub 저장소 → **Releases → Draft a new release** → APK 파일 첨부 → Publish.
2. 첨부 파일의 다운로드 링크를 복사.
3. `web/download.html` 위쪽 `APK_URL` 을 그 링크로 교체 → push.

### 1-3. 친구가 설치하는 법
1. 다운로드 페이지에서 **앱 다운로드(.apk)** 버튼 → 파일 받기.
2. “출처를 알 수 없는 앱” 경고가 뜨면 **허용**(이 브라우저에서 설치 허용).
3. **설치** → 홈 화면에 아이콘 생성. 끝!

---

## 2. 아이폰 — Safari "홈 화면에 추가" 🍎 (무료·무계정)

아이폰 친구에게는 같은 다운로드 페이지를 보내면 됩니다. 아이폰에서 열면 자동으로 이렇게 안내돼요.

1. 링크를 **Safari**로 열기(크롬·인앱 브라우저 X).
2. 아래 **공유 버튼 ⬆️** → **“홈 화면에 추가”**.
3. 홈 화면에 앱 아이콘이 생기고, 전체화면으로 앱처럼 실행돼요.

> 진짜 네이티브 앱(.ipa)으로 베타 배포하려면 **TestFlight**가 답입니다: Apple Developer($99/년) + 맥으로 한 번 업로드하면, 이메일/링크로 **최대 10,000명**을 초대할 수 있어요(가벼운 베타 심사 1회). 준비되면 [STORE.md](STORE.md) 6~7번으로 진행하세요.

---

## 3. 링크 · QR 공유하기

- **링크 그대로:** `https://date-course-recommender.onrender.com/download.html` 를 카톡으로 전송.
- **QR 이미지:** `web/download-qr.png` 를 보내거나 화면에 띄워 찍게 하기.
- 배포 주소가 바뀌면 QR을 다시 만들면 돼요:

```bash
python3 -c "import segno; segno.make('https://<내주소>/download.html', error='m').save('web/download-qr.png', scale=8, border=2, dark='#ff5a7e', light='#ffffff')"
```

---

## 4. 알아둘 점

- **APK 안에는 비밀 키가 없어요.** 카카오·네이버 키는 서버(Render)에만 있어서, APK를 나눠줘도 키가 새지 않습니다.
- **디버그 APK도 설치는 되지만**, 정식 배포·업데이트엔 **릴리스 서명 APK**를 권장합니다(같은 keystore로 서명해야 이후 업데이트 가능).
- **업데이트:** 코드 수정 → 안드로이드는 **새 APK 빌드해서 교체**, 아이폰(PWA)은 **서버만 갱신하면 자동 최신**.
- **첫 실행 지연:** Render 무료 서버는 한동안 안 쓰면 잠들어, 첫 실행이 ~1분 걸릴 수 있어요(시작화면이 가려줌). 상용화 땐 유료 플랜 권장.
- 이 방식은 **친한 지인 테스트**용이에요. 불특정 다수 공개·정식 출시는 [STORE.md](STORE.md)의 스토어 등록으로 가세요.
