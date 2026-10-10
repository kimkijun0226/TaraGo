import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { getBusArrivals } from '@/features/bus-stop/api/get-bus-arrivals';
import { queryClient } from '@/shared/lib/query-client';
import { registerPushToken } from '../api/alerts';
import { alertStorage, readCachedAlerts } from './alert-storage';
import { proximityMessage, proximityRegions, shouldNotifyVisit, type BusAlert } from './bus-alert';

const TASK = 'tarago-stop-proximity';
const CHANNEL = 'bus-arrivals';
const pendingStops = new Set<string>();

Notifications.setNotificationHandler({ handleNotification: async () => ({
  shouldShowBanner:true, shouldShowList:true, shouldPlaySound:true, shouldSetBadge:false,
}) });

/** 시간 설정과 관계없이 진입 시 정류소 전체 노선의 최신 도착정보를 알린다. */
export async function handleStopEntry(stationId: string) {
  if (pendingStops.has(stationId)) return;
  pendingStops.add(stationId);
  try {
    const alerts = await readCachedAlerts();
    const alert = alerts.find(a => a.stop.id === stationId && a.enabled && a.proximityEnabled);
    if (!alert) return;
    const state = JSON.parse(await alertStorage.getItem(`visit:${stationId}`) ?? '{}') as { inside?:boolean; lastSent?:number };
    if (!shouldNotifyVisit(state,Date.now())) return;
    let body: string;
    try {
      const arrivals = await queryClient.fetchQuery({ queryKey:['bus-stops',stationId,'arrivals'],
        queryFn:({signal}) => getBusArrivals({stationId,signal}), staleTime:0, retry:1 });
      body = proximityMessage(arrivals);
    } catch (error) {
      console.warn('접근 알림 도착정보 조회 실패', error instanceof Error ? error.message : 'network error');
      body = '도착정보를 불러오지 못했어요. 알림을 눌러 다시 확인해주세요.';
    }
    if (!(await readCachedAlerts()).some(a => a.stop.id === stationId && a.enabled && a.proximityEnabled)) return;
    await Notifications.scheduleNotificationAsync({ content:{ title:`${alert.stop.name} 근처에 도착했어요`, body,
      sound:'default',data:{alertId:alert.id,stationId}},trigger:Platform.OS === 'android' ? {channelId:CHANNEL} : null });
    await alertStorage.setItem(`visit:${stationId}`,JSON.stringify({inside:true,lastSent:Date.now()}));
  } finally { pendingStops.delete(stationId); }
}
export async function handleStopExit(stationId:string) {
  const state = JSON.parse(await alertStorage.getItem(`visit:${stationId}`) ?? '{}');
  await alertStorage.setItem(`visit:${stationId}`,JSON.stringify({...state,inside:false}));
}

if (!TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask<{eventType:Location.LocationGeofencingEventType;region:Location.LocationRegion}>(TASK,async ({data,error}) => {
    if (error) {
      await alertStorage.setItem('tarago-proximity-error','접근 감지에 실패했어요. 위치 권한을 확인해주세요.');
      console.warn('정류소 접근 감지 실패',error.message);
      return;
    }
    if (!data?.region.identifier) return;
    try {
      if (data.eventType === Location.LocationGeofencingEventType.Enter) await handleStopEntry(data.region.identifier);
      else await handleStopExit(data.region.identifier);
    } catch (error) {
      await alertStorage.setItem('tarago-proximity-error','접근 알림을 보내지 못했어요. 앱에서 다시 설정해주세요.');
      console.warn('정류소 접근 알림 실패',error instanceof Error ? error.message : 'unknown error');
    }
  });
}

export async function ensureNotificationPermission() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL,{name:'버스 도착 알림',importance:Notifications.AndroidImportance.HIGH,sound:'default'});
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('기기 설정에서 TaraGo의 알림 권한을 허용해주세요.');
}
export async function ensureProximityPermission() {
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('기기의 위치 서비스를 켜주세요.');
  if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('정류소 접근 알림을 위해 위치 권한이 필요해요.');
  if (!(await Location.requestBackgroundPermissionsAsync()).granted) throw new Error('위치 권한을 항상 허용해주세요. Android에서는 위치 권한 설정에서 모든 시간 허용을 선택해주세요.');
  if (!(await TaskManager.isAvailableAsync())) throw new Error('접근 알림은 새 개발 빌드에서 사용할 수 있어요.');
}

/** 원격 푸시 준비 실패는 저장 자체를 막지 않고 UI에서 준비 상태로 표시한다. */
export async function preparePush():Promise<string|null> {
  if (!Device.isDevice) return '예약 푸시 알림은 실기기에서 설정해주세요. 시뮬레이터에서는 화면과 접근 알림을 확인할 수 있어요.';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) return '예약 알림을 받으려면 EAS 프로젝트 연결과 APNs/FCM 푸시 설정이 필요해요.';
  try {
    const token = await Notifications.getExpoPushTokenAsync({projectId});
    await registerPushToken(token.data);
    return null;
  } catch {
    return '예약 푸시를 등록하지 못했어요. 네트워크와 앱의 푸시 설정을 확인한 뒤 다시 연결해주세요.';
  }
}

let geofenceSync:Promise<void> = Promise.resolve();
/** 네이티브 영역 등록을 직렬화해 이전 설정이 새로운 감시를 덮어쓰지 않게 한다. */
export function syncGeofences(alerts:BusAlert[]) {
  const next = geofenceSync.catch(() => undefined).then(() => applyGeofences(alerts));
  geofenceSync=next;
  return next;
}
async function applyGeofences(alerts:BusAlert[]) {
  const regions = proximityRegions(alerts);
  const registered = await Location.hasStartedGeofencingAsync(TASK);
  if (!regions.length) { if (registered) await Location.stopGeofencingAsync(TASK); return; }
  if (regions.length > 20) throw new Error('접근 알림은 최대 20개 정류소까지 설정할 수 있어요.');
  if (!(await Location.getBackgroundPermissionsAsync()).granted) throw new Error('정류소 접근 알림이 중지됐어요. 위치 권한을 항상 허용해주세요.');
  await Location.startGeofencingAsync(TASK,regions);
  await alertStorage.removeItem('tarago-proximity-error');
}

/** foreground에서도 현재 영역을 판정하며 50m 여유를 두어 GPS 흔들림을 줄인다. */
export async function checkNearbyStops(position:Location.LocationObject,alerts:BusAlert[]) {
  if (position.coords.accuracy !== null && position.coords.accuracy > 100) return;
  for (const region of proximityRegions(alerts)) {
    const north = (position.coords.latitude-region.latitude)*111_320;
    const east = (position.coords.longitude-region.longitude)*111_320*Math.cos(region.latitude*Math.PI/180);
    const distance = Math.hypot(north,east);
    if (distance <= region.radius) await handleStopEntry(region.identifier);
    else if (distance > region.radius+50) await handleStopExit(region.identifier);
  }
}
