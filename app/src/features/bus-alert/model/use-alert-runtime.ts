import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { checkNearbyStops, preparePush, syncGeofences } from './alert-runtime';
import { alertStorage, cacheAlerts, readCachedAlerts } from './alert-storage';
import { useMapTabVisibility } from '@/components/map-tab-visibility';
import { useAlerts } from './use-alerts';
import type { BusAlert } from './bus-alert';

/** 감시 등록은 화면 수와 무관하게 루트에서 한 번 수행한다. */
export function useAlertRuntime() {
  const {data:alerts} = useAlerts();
  const {setMapTabHidden} = useMapTabVisibility();
  const queryClient = useQueryClient();
  const latest = useRef<BusAlert[]>([]);
  const [error,setError] = useState<string|null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let disposed = false;
    let subscription:Location.LocationSubscription|undefined;
    async function start() {
      try {
        const saved = alerts ?? await readCachedAlerts();
        if (disposed) return;
        latest.current = saved;
        if (alerts) await cacheAlerts(alerts);
        if (disposed) return;
        await syncGeofences(saved);
        if (disposed) return;
        setError(null);
        if (!saved.some(a => a.enabled && a.proximityEnabled)) return;
        subscription = await Location.watchPositionAsync({accuracy:Location.Accuracy.Balanced,timeInterval:10_000,distanceInterval:30},position => {
          void checkNearbyStops(position,latest.current).catch(() => setError('접근 알림에 실패했어요. 위치·알림 권한을 확인해주세요.'));
        });
        if (disposed) subscription.remove();
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : '접근 감지를 시작하지 못했어요.'); }
    }
    void start();
    return () => { disposed=true; subscription?.remove(); };
  },[alerts]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let handled:string|undefined;
    function open(response:Notifications.NotificationResponse) {
      const data = response.notification.request.content.data;
      if (!data) return;
      const id = response.notification.request.identifier;
      if (handled === id || typeof data.alertId !== 'string') return;
      handled=id;
      setMapTabHidden(false);
      router.push({pathname:'/alerts',params:{alertId:data.alertId,requestId:id,stationId:'',routeId:''}});
    }
    const response = Notifications.getLastNotificationResponse();
    if (response) open(response);
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    const tokenListener = Notifications.addPushTokenListener(() => { void preparePush().then(() => queryClient.invalidateQueries({queryKey:['alerts','push-status']})); });
    const appListener = AppState.addEventListener('change',state => {
      if (state !== 'active') return;
      void queryClient.invalidateQueries({queryKey:['alerts']});
      void alertStorage.getItem('tarago-proximity-error').then(setError);
    });
    return () => { listener.remove(); tokenListener.remove(); appListener.remove(); };
  },[queryClient,setMapTabHidden]);
  return error;
}
