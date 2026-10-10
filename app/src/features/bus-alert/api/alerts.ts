import * as SecureStore from 'expo-secure-store';
import { apiClient } from '@/shared/api/client';
import type { BusAlert, BusAlertInput } from '../model/bus-alert';

let registration: Promise<string> | undefined;

/** 서버의 무작위 기기 자격 증명은 화면·로그가 아닌 OS 보안 저장소에 보관한다. */
async function credential() {
  if (registration) return registration;
  registration = (async () => {
    const existing = await SecureStore.getItemAsync('tarago-alert-credential');
    if (existing) return existing;
    const { data } = await apiClient.post<{credential:string}>('/alerts/devices');
    await SecureStore.setItemAsync('tarago-alert-credential',data.credential,{keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY});
    return data.credential;
  })();
  try { return await registration; } finally { registration = undefined; }
}
async function auth() { return { headers: { Authorization:`Bearer ${await credential()}` } }; }
export async function getAlerts(signal?:AbortSignal): Promise<BusAlert[]> {
  const { data } = await apiClient.get<BusAlert[]>('/alerts',{...await auth(),signal});
  return data;
}
export async function getPushStatus(): Promise<{ready:boolean;error:string|null}> {
  const { data } = await apiClient.get<{ready:boolean;error:string|null}>('/alerts/devices/status',await auth());
  return data;
}
export async function registerPushToken(token: string) {
  await apiClient.put('/alerts/devices/push-token',{token},await auth());
}
export async function saveAlert(input:BusAlertInput,id?:string): Promise<BusAlert> {
  const config = await auth();
  const { data } = id ? await apiClient.put<BusAlert>(`/alerts/${id}`,input,config) : await apiClient.post<BusAlert>('/alerts',input,config);
  return data;
}
export async function deleteAlert(id:string) { await apiClient.delete(`/alerts/${id}`,await auth()); }
