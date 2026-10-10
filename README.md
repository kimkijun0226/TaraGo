# TaraGo

TaraGo는 버스·지하철을 이용하는 사람을 위한 지도 기반 도착 알림 앱입니다. 주변 정류장을 지도에서 찾고 도착 정보를 확인한 뒤, 원하는 노선과 시간대의 알림을 예약하는 경험을 목표로 합니다.

버스 정류장 지도·도착 정보 조회, 예약 알림 설정과 서버 감시, 정류소 접근 알림을 구현했습니다. 예약 푸시는 EAS/APNs/FCM 설정 후 실기기에서 사용할 수 있습니다. 실행 준비와 플랫폼 제한은 `app/docs/bus-alerts.md`를 참고하세요. 지하철 도착 정보는 이후 단계에서 확장할 예정입니다.

## 기술 스택

- **앱 (`app/`)**: React Native, TypeScript, Expo Development Build, Expo Router, 네이버 지도 SDK, TanStack Query, Axios
- **서버 (`server/`)**: NestJS, TypeScript, PostgreSQL/PostGIS, 공공데이터포털 버스 데이터 API

지도용 정류장 정보는 서버의 데이터베이스에서 조회하고, 선택한 정류장의 도착 정보는 서버가 공공데이터 API를 통해 제공합니다. 앱과 서버는 한 저장소에서 각각 독립된 프로젝트로 관리합니다.
