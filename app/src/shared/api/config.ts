import { Platform } from 'react-native';

/** 에뮬레이터는 플랫폼마다 개발 머신의 localhost에 접근하는 주소가 다르다. */
const simulatorApiBaseUrl =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://127.0.0.1:3000';

/**
 * 앱이 요청할 TaraGo API 주소.
 *
 * 기본 주소는 로컬 시뮬레이터용이다. 실제 기기에서는 localhost가
 * 개발 머신을 가리키지 않으므로 접근 가능한 주소를 환경 변수로 지정한다.
 * 이 값은 앱 번들에 포함되므로 인증키를 넣으면 안 된다.
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? simulatorApiBaseUrl;
