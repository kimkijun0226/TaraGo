import Storage from 'expo-sqlite/kv-store';
import type { BusAlert } from './bus-alert';

/** 백그라운드 작업은 React 캐시 없이 접근하므로 서버 설정의 마지막 사본만 기기에 보관한다. */
export async function cacheAlerts(alerts: BusAlert[]) { await Storage.setItem('tarago-alerts',JSON.stringify(alerts)); }
export async function readCachedAlerts(): Promise<BusAlert[]> {
  const value = await Storage.getItem('tarago-alerts');
  return value ? JSON.parse(value) : [];
}
export { Storage as alertStorage };
