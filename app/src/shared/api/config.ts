import { Platform } from 'react-native';

const simulatorApiBaseUrl =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://127.0.0.1:3000';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? simulatorApiBaseUrl;
