# 머니노트 작업 규칙

혼자 쓰는 가계부 앱이다. 실행·백업·개발 방법은 README.md를 본다.

## 저장소는 public이다

- 실제 가계부 내역, 메모, 금액, 이름, 서버 주소(Tailscale IP·MagicDNS), 비밀번호를 코드·테스트·커밋·PR에 넣지 않는다.
- `.env*`(`.env.example` 제외), `data/`, `backups/`, 내보낸 csv·xlsx는 .gitignore로 빠져 있다. 새 비밀값이나 데이터 파일이 생기면 먼저 .gitignore에 넣는다.

## 새 기능은 PR로 올린다

1. main에서 `feat/<기능>` 브랜치를 만든다(버그 수정은 `fix/<내용>`). main에 직접 커밋하지 않는다.
2. 구현하고 확인한다: `npx tsc --noEmit`, `npm run lint`, `npx prettier --check src e2e`, `npm run test:e2e`.
3. 데모 GIF를 만든다(아래).
4. 브랜치를 push하고 `gh pr create`로 main에 PR을 연다. 본문에는 바뀐 점, 확인한 것(테스트 결과), 데모 GIF를 넣는다.
5. 머지와 운영 반영(`docker compose up -d --build`)은 사용자가 요청할 때 한다.

## PR 데모 GIF

- **샘플 데이터로만 찍는다.** `npm run demo`는 e2e와 같이 빌드한 뒤 임시 빈 DB로 서버를 띄운다. 운영 DB나 그 복사본으로 찍지 않는다.
- 녹화 스펙은 `e2e/demo/<기능>.demo.ts`에 둔다. API로 샘플 내역을 넣고, `startRecording` → 화면 조작(`pause`, `scrollToTarget`) → `recording.stop("<이름>")` 순서로 쓴다. `e2e/demo/insights.demo.ts`가 예시다. 모바일(Pixel 7) 화면으로 찍고, 누른 곳은 `showTaps`로 표시된다.
- 결과는 `demo-output/<이름>.gif`(git에 안 들어감). `DEMO_KEEP_FRAMES=1 npm run demo`로 프레임 jpg를 남겨 내용을 눈으로 확인한 뒤 올린다. 이미 빌드했으면 `E2E_SKIP_BUILD=1`로 빌드를 건너뛴다.
- 올리기: `scripts/pr-assets.sh <브랜치 이름> demo-output/<이름>.gif` — `pr-assets/<브랜치 이름>` 고아 브랜치에 올리고 커밋 SHA로 고정한 `<img>` 태그를 출력한다. 그대로 PR 본문에 붙인다.
- 녹화 스펙은 다음 기능의 예시가 되도록 커밋해 둔다. 일반 e2e(`npm run test:e2e`)에는 포함되지 않는다.
