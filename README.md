# 머니노트

혼자 쓰는 가계부입니다. Docker 컨테이너로 실행하고, 데이터는 Docker 볼륨에 저장됩니다.

## 실행과 관리

```bash
docker compose up -d --build   # 빌드 후 시작. 코드를 고친 뒤에도 같은 명령
docker compose ps              # 상태 확인
docker compose logs -f         # 로그 보기
docker compose restart         # 재시작
docker compose down            # 중지 (데이터는 유지)
```

- 주소는 `.env`의 `MONEYNOTE_BIND`(예: Tailscale 주소)와 포트 3100입니다. 바인딩한 네트워크에 연결된 기기에서만 열립니다.
- 서버가 재부팅되면 자동으로 다시 켜집니다. Tailscale이 늦게 뜨면 준비될 때까지 재시도합니다.
- 접속 주소와 포트는 `.env`의 `MONEYNOTE_BIND`, `MONEYNOTE_PORT`로 정합니다. 바꾼 뒤 `docker compose up -d`를 실행하세요.
- 비밀번호는 `.env.local`의 `SITE_PASSWORD`입니다. 바꾼 뒤 `docker compose up -d`를 실행하세요.
- `docker compose down -v`는 **데이터까지 지웁니다.**

## 백업과 복원

```bash
# 백업: 현재 폴더에 moneynote-backup.tgz 생성
docker compose stop
docker run --rm -v moneynote_data:/data -v "$PWD":/backup alpine tar czf /backup/moneynote-backup.tgz -C /data .
docker compose start

# 복원: 기존 데이터를 지우고 백업으로 교체
docker compose stop
docker run --rm -v moneynote_data:/data -v "$PWD":/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/moneynote-backup.tgz -C /data"
docker compose start
```

내역은 앱의 CSV 내보내기로도 받을 수 있습니다.

## 개발

```bash
npm install
npm run dev      # http://127.0.0.1:3100, 데이터는 ./data/pglite
```

컨테이너가 켜져 있으면 포트가 겹치니 `PORT=3101 npm run dev`처럼 띄웁니다. 개발용 데이터는 컨테이너 데이터와 분리됩니다.

E2E 테스트는 `npm run test:e2e`로 실행합니다. 앱을 빌드한 뒤 테스트마다 빈 임시 DB로 서버를 따로 띄우므로 실제 데이터와 운영 컨테이너에는 접속하지 않습니다. 처음 한 번은 `npx playwright install chromium`이 필요합니다.

DB 구조를 바꿀 때는 `src/lib/db/schema.ts`를 고치고 `npm run db:generate`를 실행하세요. 마이그레이션은 서버가 시작할 때 자동으로 적용됩니다.

새 기능은 PR로 올리고 PR에 데모 GIF를 붙입니다. 절차는 [CLAUDE.md](CLAUDE.md)를 보세요.
