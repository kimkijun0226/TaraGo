# TaraGo API

NestJS API는 지도 정류장을 PostgreSQL/PostGIS에서 조회하고, 선택한 정류장의 버스 도착정보만 공공데이터 API에서 조회한다.

## 시작

```bash
npm install
npm run start:dev
```

이 폴더의 `.env.example`을 참고해 `.env.local`에 `DATABASE_URL`, `PUBLIC_DATA_SERVICE_KEY`를 설정한다. 이 파일은 커밋하지 않는다.

## 정류장 CSV 적재

[국토교통부 전국 버스정류장 위치정보](https://www.data.go.kr/data/15067528/fileData.do) CSV를 내려받고 `.env.local`의 `BUS_STATIONS_CSV_PATH`에 절대 경로를 설정한다. 제공 파일이 CP949라면 `BUS_STATIONS_CSV_ENCODING=euc-kr`을 사용한다.

```bash
npm run build
npm run sync:stations
```

적재는 같은 TAGO ID를 갱신한다. 파일의 유효한 행이 `BUS_STATIONS_MIN_ROWS`보다 적으면 전체 작업을 롤백한다. 검증에 성공한 경우에만 이전 전국 CSV에 있던 폐지 정류장 출처를 제거하며, 다른 출처가 연결된 정류장은 보존한다. 새 CSV가 발표되면 이 명령을 다시 실행한다. API 요청 중에는 적재하지 않는다.

## 검증

```bash
npm test -- --runInBand
npm run lint
npm run build
```

전국 CSV는 연간 스냅샷이므로 최신 정류장 전체를 보장하지 않는다. 최신 지역별 대량 데이터 보강은 별도 작업이다.
