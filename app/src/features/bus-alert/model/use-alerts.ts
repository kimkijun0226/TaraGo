import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { deleteAlert, getAlerts, getPushStatus, saveAlert } from '../api/alerts';
import { cacheAlerts, readCachedAlerts } from './alert-storage';
import type { BusAlert, BusAlertInput } from './bus-alert';

export function useAlerts() {
  return useQuery({queryKey:['alerts','list'],queryFn:({signal})=>getAlerts(signal),enabled:Platform.OS !== 'web'});
}
export function usePushStatus() {
  return useQuery({queryKey:['alerts','push-status'],queryFn:getPushStatus,enabled:Platform.OS !== 'web'});
}
export function useAlertMutations() {
  const client = useQueryClient();
  const updateCache = useCallback(async (change:(alerts:BusAlert[])=>BusAlert[]) => {
    const current = client.getQueryData<BusAlert[]>(['alerts','list']) ?? await readCachedAlerts();
    const next = change(current);
    await cacheAlerts(next);
    client.setQueryData(['alerts','list'],next);
    void client.invalidateQueries({queryKey:['alerts']});
  }, [client]);
  const cancel = useCallback(() => client.cancelQueries({queryKey:['alerts','list']}), [client]);
  const save = useMutation({onMutate:cancel,mutationFn:({input,id}:{input:BusAlertInput;id?:string}) => saveAlert(input,id),
    onSuccess:alert => updateCache(current => [alert,...current.filter(a => a.id !== alert.id)])});
  const remove = useMutation({onMutate:cancel,mutationFn:deleteAlert,onSuccess:(_,id) => updateCache(current => current.filter(a => a.id !== id))});
  return {save,remove};
}
