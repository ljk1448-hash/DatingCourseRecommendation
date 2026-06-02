# 업데이트·배포 절차 (매번 이 순서)

## 무엇이 어떻게 반영되나
- **서버 변경**(추천 로직·장소 필터·썸네일·`/api` 등) → **git push → Render 재배포**만으로 **이미 설치된 모든 앱에 즉시 반영**(앱 재설치 불필요).
- **앱 화면/네이티브 변경**(UI·뒤로가기·플러그인·아이콘 등) → **새 APK를 만들어야** 반영. 친구들은 **링크에서 새로 받아 재설치**해야 적용됨.

## 매 업데이트 한 세트 (복붙)
```powershell
cd "C:\Users\GOOD\Desktop\데이트 코스 추천 앱"

# (1) 화면 변경분 동기화 + 서명된 APK 빌드
npm install            # 플러그인을 새로 추가했을 때만 필요(평소 생략 가능)
npx cap sync
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
cd android; .\gradlew.bat assembleRelease; cd ..

# (2) 배포용 APK 교체 (친구 설치 링크 갱신)
copy "android\app\build\outputs\apk\release\app-release.apk" "downloads\app-release.apk" /Y

# (3) 서버 변경 + 새 APK 한 번에 푸시 → Render 재배포 + 설치 링크 갱신
git add .
git commit -m "update: 최신 빌드 배포"
git push
```

## 내 폰 테스트
- 폰에서 **기존 앱 삭제 → 새 `app-release.apk` 설치** (덮어쓰기보다 삭제 후 설치가 깔끔).

## 친구 배포 (링크는 항상 동일)
- 공유 링크: `https://date-course-recommender.onrender.com/download.html`
- 친구는 이 링크에서 **새로 받아 설치**하면 최신. (안드로이드=APK, 아이폰=홈 화면에 추가)
- QR로 보내려면: `web/download-qr.png`

## ⚠️ 버전 번호(업데이트 인식)
앱 내용을 바꿔 **친구에게 갱신 배포**할 땐, `android/app/build.gradle` 의 `versionCode` 를 1씩 올리세요(예: 1 → 2 → 3).
```
versionCode 2
versionName "1.0.1"
```
- versionCode를 올려야 친구 폰이 "업데이트"로 인식해요(같은 번호면 일부 기기에서 설치가 막힐 수 있음).
- 나중에 Google Play에 올릴 때도 versionCode는 매 업로드마다 반드시 증가해야 합니다.

## 요약
- **추천/장소/이미지 같은 서버 로직만 고쳤다** → (3) push만 하면 끝(친구 재설치 불필요).
- **화면·기능(네이티브)도 고쳤다** → versionCode 올리고 (1)~(3) 전부 → 친구는 링크에서 재설치.
