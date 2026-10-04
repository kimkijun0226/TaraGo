import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
  type TabListProps,
} from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** 웹에서는 지도와 알림 두 경로만 하단 탭으로 노출한다. */
export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.content} />
      <TabList asChild>
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

function TabBar(props: TabListProps) {
  return <View {...props} style={styles.tabBar} />;
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={[styles.tabButton, isFocused && styles.selectedTab]}>
      <Text style={styles.label}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { height: '100%' },
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
