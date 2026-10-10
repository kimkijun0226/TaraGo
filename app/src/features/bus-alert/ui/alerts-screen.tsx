import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { useMapTabVisibility } from '@/components/map-tab-visibility';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { groupBusArrivals, formatEta } from '@/features/bus-stop/model/bus-arrival';
import { useAlerts, useAlertMutations, usePushStatus } from '../model/use-alerts';
import { ensureNotificationPermission, ensureProximityPermission, preparePush } from '../model/alert-runtime';
import { useAlertRuntimeError } from './alert-runtime-provider';
import type { AlertStop, BusAlert, BusAlertInput } from '../model/bus-alert';

const EMPTY_ARRIVALS: import('../../bus-stop/api/get-bus-arrivals').BusArrival[] = [];
const WEEKDAYS = ['일','월','화','수','목','금','토'];
type Draft = BusAlertInput & { id?:string; stop:AlertStop; busNumber:string };

/** 알림 목록과 정류소·노선별 편집기를 같은 탭에서 보여준다. */
export default function AlertsScreen() {
  const params = useLocalSearchParams<{stationId?:string;stationName?:string;latitude?:string;longitude?:string;routeId?:string;busNumber?:string;stationSeq?:string;requestId?:string;alertId?:string}>();
  const {data:alerts=[]} = useAlerts();
  const saved = params.alertId ? alerts.find(a => a.id === params.alertId) : undefined;
  let initialDraft:Draft|null = saved ?? null;
  const latitude=Number(params.latitude),longitude=Number(params.longitude);
  if (!params.alertId && params.requestId && params.stationId && params.routeId && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude)<=90 && Math.abs(longitude)<=180) {
    initialDraft={stationId:params.stationId,routeId:params.routeId,busNumber:params.busNumber ?? params.routeId,
      ...(params.stationSeq ? {stationSeq:Number(params.stationSeq)} : {}),
      stop:{id:params.stationId,name:params.stationName ?? '정류소',latitude,longitude},
      days:[1,2,3,4,5],startTime:'07:00',endTime:'09:00',thresholdMinutes:5,scheduledEnabled:true,
      enabled:true,proximityEnabled:true,radius:200};
  }
  return <AlertsScreenContent key={`${params.requestId ?? ''}:${params.alertId ?? ''}:${Boolean(saved)}`} initialDraft={initialDraft} />;
}

function AlertsScreenContent({initialDraft}:{initialDraft:Draft|null}) {
  const {setMapTabHidden} = useMapTabVisibility();
  const {data:alerts=[],isPending,isError,refetch} = useAlerts();
  const {data:pushStatus} = usePushStatus();
  const {save,remove} = useAlertMutations();
  const {mutateAsync: saveAsync} = save;
  const {mutateAsync: removeAsync} = remove;
  const runtimeError = useAlertRuntimeError();
  const client = useQueryClient();
  const [draft,setDraft] = useState<Draft|null>(initialDraft);
  const [busy,setBusy] = useState(false);
  const [pushWarning,setPushWarning] = useState<string|null>(null);
  const [threshold,setThreshold] = useState(String(initialDraft?.thresholdMinutes ?? 5));
  const {data:arrivals=EMPTY_ARRIVALS,isError:arrivalError,isFetching:arrivalLoading,refetch:refreshArrivals} = useBusArrivals(draft?.stationId ?? '');

  const arrivalGroups = useMemo(() => groupBusArrivals(arrivals), [arrivals]);

  const changeScheduled = useCallback((value: boolean) => setDraft(current => current && ({...current, scheduledEnabled: value})), []);
  const changeProximity = useCallback((value: boolean) => setDraft(current => current && ({...current, proximityEnabled: value})), []);
  const toggleDay = useCallback((day: number) => setDraft(current => current && ({...current,
    days: current.days.includes(day) ? current.days.filter(d => d !== day) : [...current.days, day].sort(),
  })), []);
  const changeThreshold = useCallback((value: number) => setThreshold(String(value)), []);
  const changeRadius = useCallback((radius: number) => setDraft(current => current && ({...current, radius})), []);

  const prepare = useCallback(async (input:BusAlertInput) => {
    if (!input.enabled) return;
    await ensureNotificationPermission();
    if (input.proximityEnabled) await ensureProximityPermission();
    if (input.scheduledEnabled) {
      setPushWarning(await preparePush());
      await client.invalidateQueries({queryKey:['alerts','push-status']});
    }
  }, [client]);
  const submit = useCallback(async () => {
    if (!draft || busy) return;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    const minutes = Number(threshold);
    if (!time.test(draft.startTime) || !time.test(draft.endTime) || draft.startTime === draft.endTime
      || !draft.days.length || !Number.isInteger(minutes) || minutes<1 || minutes>30
      || (!draft.scheduledEnabled && !draft.proximityEnabled)) {
      Alert.alert('설정을 확인해주세요','시간은 08:30 형식으로 입력하고, 요일과 알림 방식을 선택해주세요. 도착 기준은 1~30분입니다.');return;
    }
    setBusy(true);
    try {
      const input = {...draft,thresholdMinutes:minutes};
      await prepare(input);
      await saveAsync({input,id:draft.id});
      setDraft(null);
    } catch (error) { Alert.alert('알림을 저장하지 못했어요',errorMessage(error)); }
    finally { setBusy(false); }
  }, [draft, busy, threshold, prepare, saveAsync]);
  const toggle = useCallback(async (alert:BusAlert, value:boolean) => {
    setBusy(true);
    try { const input={...alert,enabled:value};await prepare(input);await saveAsync({input,id:alert.id}); }
    catch(error) { Alert.alert('알림을 변경하지 못했어요',errorMessage(error)); }
    finally {setBusy(false);}
  }, [prepare, saveAsync]);
  const removeAlert = useCallback((alert:BusAlert) => {
    Alert.alert('알림을 삭제할까요?',`${alert.stop.name} · ${alert.busNumber}번`,[
      {text:'취소',style:'cancel'},
      {text:'삭제',style:'destructive',onPress:() => {void removeAsync(alert.id).catch(error => Alert.alert('삭제하지 못했어요',errorMessage(error)));}},
    ]);
  }, [removeAsync]);
  const reconnect = useCallback(async () => {
    setBusy(true);
    try {await ensureNotificationPermission();setPushWarning(await preparePush());await client.invalidateQueries({queryKey:['alerts','push-status']});}
    catch(error) {Alert.alert('알림 연결 확인',errorMessage(error));}
    finally {setBusy(false);}
  }, [client]);

  if (Platform.OS === 'web') return <SafeAreaView style={styles.page}><Text style={styles.title}>버스 알림</Text><Text style={styles.help}>예약·접근 알림은 iOS 또는 Android 앱에서 설정해주세요.</Text></SafeAreaView>;

  return <SafeAreaView style={styles.page} edges={['top','left','right']}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        {draft ? <Pressable accessibilityRole="button" accessibilityLabel="알림 목록으로 돌아가기" onPress={() => setDraft(null)} style={styles.iconButton}>
          <SymbolView name={{ios:'chevron.left',android:'arrow_back',web:'arrow_back'}} size={22} tintColor="#15171A" />
        </Pressable> : null}
        <Text style={styles.title}>{draft ? '알림 설정' : '버스 알림'}</Text>
        <Pressable accessibilityRole="button" onPress={() => {setMapTabHidden(false);router.navigate('/');}}><Text style={styles.link}>지도</Text></Pressable>
      </View>
      <Text style={styles.help}>원하는 시간에, 정류소 가까이에서. 버스를 놓치지 않도록 알려드려요.</Text>
      {runtimeError ? <View style={styles.warning}><Text style={styles.warningText}>{runtimeError}</Text><Pressable onPress={() => void Linking.openSettings()}><Text style={styles.link}>기기 설정 열기</Text></Pressable></View> : null}
      {(pushWarning || (alerts.some(a => a.enabled && a.scheduledEnabled) && pushStatus?.ready === false)) ? <View style={styles.warning}>
        <Text style={styles.warningText}>{pushWarning ?? (pushStatus?.error ? '서버의 푸시 자격 증명을 확인해주세요. 예약 알림이 중지되어 있어요.' : '예약 알림의 푸시 연결이 필요해요. 접근 알림은 별도로 동작합니다.')}</Text>
        <Pressable disabled={busy} onPress={() => void reconnect()}><Text style={styles.link}>푸시 다시 연결</Text></Pressable>
      </View> : null}

      {draft ? <>
        <View style={styles.stationCard}>
          <Text style={styles.stationName}>{draft.stop.name}</Text>
          <Text style={styles.busNumber}>{draft.busNumber}번 버스</Text>
          <Text style={styles.help}>선택한 정류소와 진행 방향으로 알림을 설정해요.</Text>
        </View>
        <View style={styles.card}>
          <Toggle title="예약 도착 알림" description="선택한 요일과 시간 안에서 도착 직전에 알려드려요." value={draft.scheduledEnabled} onChange={changeScheduled} />
          {draft.scheduledEnabled ? <>
            <Text style={styles.label}>반복 요일</Text>
            <View style={styles.chips}>{[1,2,3,4,5,6,0].map(day => <Choice key={day} label={WEEKDAYS[day]} selected={draft.days.includes(day)} value={day} onSelect={toggleDay} />)}</View>
            <Text style={styles.label}>감시 시간 · 한국 시간</Text>
            <View style={styles.timeRow}>
              <View style={styles.timeField}><Text style={styles.help}>시작</Text><TextInput accessibilityLabel="감시 시작 시간" value={draft.startTime} onChangeText={value => setDraft({...draft,startTime:value})} placeholder="07:00" maxLength={5} style={styles.timeInput} /></View>
              <Text style={styles.help}>~</Text>
              <View style={styles.timeField}><Text style={styles.help}>종료</Text><TextInput accessibilityLabel="감시 종료 시간" value={draft.endTime} onChangeText={value => setDraft({...draft,endTime:value})} placeholder="09:00" maxLength={5} style={styles.timeInput} /></View>
            </View>
            <Text style={styles.help}>종료가 시작보다 이르면 다음 날까지 감시해요.</Text>
            <Text style={styles.label}>버스 도착 몇 분 전에 알려드릴까요?</Text>
            <View style={styles.chips}>{[1,3,5,10].map(value => <Choice key={value} label={`${value}분 전`} selected={threshold === String(value)} value={value} onSelect={changeThreshold} />)}</View>
            <View style={styles.inline}><TextInput accessibilityLabel="직접 입력한 도착 알림 기준 분" value={threshold} onChangeText={setThreshold} keyboardType="number-pad" maxLength={2} style={styles.numberInput} /><Text style={styles.help}>분 전 · 1~30분 직접 입력</Text></View>
            <Text style={styles.help}>앱을 닫아도 서버가 감시해요. 푸시 연결이 완료되어야 예약 알림을 받을 수 있어요.</Text>
          </> : null}
        </View>
        <View style={styles.card}>
          <Toggle title="정류소 접근 알림" description="예약 시간과 관계없이 가까워지면 버스별 남은 시간을 알려드려요." value={draft.proximityEnabled} onChange={changeProximity} />
          {draft.proximityEnabled ? <>
            <Text style={styles.label}>정류소까지 거리</Text>
            <View style={styles.chips}>{[100,200,300].map(radius => <Choice key={radius} label={`${radius}m`} selected={draft.radius===radius} value={radius} onSelect={changeRadius} />)}</View>
            <Text style={styles.help}>설정한 정류소의 모든 버스를 알려드려요. 머무르는 동안 반복하지 않으며, 나갔다 다시 접근하면 재알림해요.</Text>
            <Text style={styles.help}>백그라운드 감지를 위해 위치 ‘항상 허용’이 필요해요. 감지 시점은 GPS와 기기 절전 설정에 따라 달라질 수 있어요.</Text>
          </> : null}
        </View>
        <View style={styles.card}>
          <View style={styles.heading}><Text style={styles.sectionTitle}>이 정류소의 현재 도착정보</Text><Pressable disabled={arrivalLoading} onPress={() => void refreshArrivals()}><Text style={styles.link}>새로고침</Text></Pressable></View>
          {arrivalError ? <Text style={styles.warningText}>도착정보를 불러오지 못했어요.</Text> : arrivalLoading && !arrivals.length ? <ActivityIndicator /> : !arrivals.length ? <Text style={styles.help}>현재 도착정보가 없습니다.</Text> : arrivalGroups.map(group => <View key={`${group.routeId}:${group.stationSeq}`} style={styles.liveRow}>
            <Text style={styles.liveNumber}>{group.busNumber}번</Text><Text style={styles.liveEta}>{formatEta(group.first.etaSeconds,group.first.serviceStatus,group.first.etaPrecision,group.first.etaSource)}</Text>
          </View>)}
        </View>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={[styles.saveButton,busy && styles.dim]}>{busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>{draft.id ? '변경 사항 저장' : '알림 저장'}</Text>}</Pressable>
      </> : <>
        {isPending ? <ActivityIndicator style={styles.loading} color="#1769E0" /> : isError ? <View style={styles.card}>
          <Text style={styles.warningText}>알림 목록을 불러오지 못했어요. 서버 연결을 확인해주세요.</Text><Pressable onPress={() => void refetch()}><Text style={styles.link}>다시 시도</Text></Pressable>
        </View> : !alerts.length ? <View style={styles.empty}>
          <SymbolView name={{ios:'bell',android:'notifications',web:'notifications'}} size={42} tintColor="#1769E0" />
          <Text style={styles.stationName}>아직 설정한 알림이 없어요</Text><Text style={styles.help}>지도에서 정류소를 고르고 버스 시간 오른쪽의 종 버튼을 눌러주세요.</Text>
          <Pressable onPress={() => {setMapTabHidden(false);router.navigate('/');}}><Text style={styles.link}>지도에서 버스 선택하기</Text></Pressable>
        </View> : alerts.map(alert => <View key={alert.id} style={[styles.card,!alert.enabled && styles.dim]}>
          <View style={styles.heading}><View style={styles.flex}><Text style={styles.stationName}>{alert.stop.name}</Text><Text style={styles.busNumber}>{alert.busNumber}번 버스</Text></View><Switch accessibilityLabel={`${alert.busNumber}번 알림 사용`} disabled={busy || save.isPending || remove.isPending} value={alert.enabled} onValueChange={value => void toggle(alert,value)} trackColor={{true:'#1769E0'}} /></View>
          {alert.scheduledEnabled ? <><Text style={styles.detail}>{alert.days.map(day => WEEKDAYS[day]).join(' · ')}  {alert.startTime}–{alert.endTime}</Text><Text style={styles.detail}>도착 {alert.thresholdMinutes}분 전 · {pushStatus?.ready ? '예약 감시' : '푸시 연결 필요'}</Text></> : null}
          {alert.proximityEnabled ? <Text style={styles.detail}>정류소 {alert.radius}m 접근 시 전체 버스 알림</Text> : null}
          <View style={styles.actions}><Pressable accessibilityRole="button" disabled={busy} onPress={() => {setDraft(alert);setThreshold(String(alert.thresholdMinutes));}}><Text style={styles.link}>수정</Text></Pressable><Pressable accessibilityRole="button" disabled={remove.isPending || busy} onPress={() => removeAlert(alert)}><Text style={styles.deleteText}>삭제</Text></Pressable></View>
        </View>)}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

function errorMessage(error:unknown) {
  const response = error as {response?:{data?:{message?:unknown}}};
  const message = response.response?.data?.message;
  return typeof message === 'string' ? message : error instanceof Error ? error.message : '네트워크와 권한 설정을 확인해주세요.';
}
const Toggle = memo(function Toggle({title,description,value,onChange}:{title:string;description:string;value:boolean;onChange:(value:boolean)=>void}) {
  return <View style={styles.heading}><View style={styles.flex}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.help}>{description}</Text></View><Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{true:'#1769E0'}} /></View>;
});
const Choice = memo(function Choice({label,selected,value,onSelect}:{label:string;selected:boolean;value:number;onSelect:(value:number)=>void}) {
  const onPress = useCallback(() => onSelect(value), [onSelect, value]);
  return <Pressable accessibilityRole="button" accessibilityState={{selected}} onPress={onPress} style={[styles.chip,selected && styles.selectedChip]}><Text style={[styles.chipText,selected && styles.selectedChipText]}>{label}</Text></Pressable>;
});
const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#F5F7FA'}, content:{padding:20,paddingBottom:120,gap:16},
  heading:{flexDirection:'row',alignItems:'center',gap:12},flex:{flex:1},title:{flex:1,fontSize:28,fontWeight:'800',color:'#15171A'},
  help:{color:'#69717C',fontSize:13,lineHeight:21},link:{color:'#1769E0',fontSize:14,fontWeight:'600',paddingVertical:8},
  card:{backgroundColor:'#FFF',borderRadius:20,padding:18,gap:14},stationCard:{backgroundColor:'#EAF2FF',borderRadius:20,padding:20,gap:8},
  stationName:{color:'#15171A',fontSize:19,fontWeight:'700'},busNumber:{color:'#1769E0',fontSize:22,fontWeight:'700',marginTop:5},
  sectionTitle:{fontSize:16,fontWeight:'700',color:'#15171A'},label:{fontSize:14,fontWeight:'600',color:'#343A40',marginTop:6},
  chips:{flexDirection:'row',flexWrap:'wrap',gap:7},chip:{minWidth:36,minHeight:44,borderRadius:12,backgroundColor:'#F0F2F5',paddingHorizontal:10,alignItems:'center',justifyContent:'center'},
  selectedChip:{backgroundColor:'#1769E0'},chipText:{color:'#596270',fontSize:14,fontWeight:'600'},selectedChipText:{color:'#FFF'},
  timeRow:{flexDirection:'row',alignItems:'center',gap:12},timeField:{flex:1,backgroundColor:'#F5F7FA',borderRadius:12,padding:12},timeInput:{fontSize:24,color:'#15171A',paddingVertical:4},
  inline:{flexDirection:'row',alignItems:'center',gap:10},numberInput:{minWidth:65,padding:12,borderRadius:10,backgroundColor:'#F5F7FA',fontSize:18,color:'#15171A'},
  saveButton:{backgroundColor:'#1769E0',minHeight:54,borderRadius:16,alignItems:'center',justifyContent:'center'},saveText:{color:'#FFF',fontSize:17,fontWeight:'700'},
  iconButton:{minWidth:44,minHeight:44,justifyContent:'center',alignItems:'center'},dim:{opacity:0.55},detail:{fontSize:14,color:'#596270',lineHeight:21},
  actions:{flexDirection:'row',gap:24,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:'#E9ECEF',paddingTop:6},deleteText:{color:'#D44343',paddingVertical:8,fontSize:14},
  empty:{paddingVertical:60,gap:18,alignItems:'center'},loading:{paddingVertical:60},warning:{backgroundColor:'#FFF3DB',padding:16,borderRadius:16,gap:8},warningText:{color:'#8B5E12',fontSize:13,lineHeight:21},
  liveRow:{flexDirection:'row',justifyContent:'space-between',gap:10},liveNumber:{color:'#343A40',fontSize:14,fontWeight:'600'},liveEta:{color:'#1769E0',fontSize:14,flexShrink:1,textAlign:'right'},
});
