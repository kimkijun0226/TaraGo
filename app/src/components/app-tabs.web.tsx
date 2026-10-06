import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
  type TabListProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useMapTabVisibility } from '@/components/map-tab-visibility';

/** 네이티브 탭을 사용할 수 없는 웹에서 같은 지도·알림 경로를 하단 탭으로 보여 준다. */
export default function AppTabs() {
  const { isMapTabHidden } = useMapTabVisibility();
  return (
    <Tabs>
      <TabSlot style={styles.content} />
      <TabList asChild style={isMapTabHidden ? styles.hidden : undefined}>
        <TabBar>
          <TabTrigger name="map" href="/" asChild>
            <TabButton>지도</TabButton>
          </TabTrigger>
          <TabTrigger name="alerts" href="/alerts" asChild>
            <TabButton>알림</TabButton>
          </TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  );
}

/** Expo Router의 탭 목록에 웹 전용 레이아웃을 적용한다. */
function TabBar(props: TabListProps) {
  return <View {...props} style={styles.tabBar} />;
}

/** 현재 선택된 웹 탭만 강조하고 나머지 트리거 속성은 그대로 전달한다. */
function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={[styles.tabButton, isFocused && styles.selectedTab]}>
      <Text style={styles.label}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { height: '100%' },
  hidden: { display: 'none' },
  tabBar: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    padding: 4,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  tabButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
  selectedTab: { backgroundColor: '#E7F0FF' },
  label: { color: '#15171A', fontSize: 14 },
});
