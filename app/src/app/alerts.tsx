import { StyleSheet, Text, View } from 'react-native';

/**
 * 예약 알림 기능이 서버에 연결되기 전까지 표시하는 빈 상태 화면.
 *
 * 이 화면은 아직 저장된 알림을 조회하거나 생성하지 않는다.
 */
export default function AlertsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>예약 알림</Text>
      <Text style={styles.description}>아직 설정한 알림이 없습니다.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  title: {
    color: '#15171A',
    fontSize: 22,
    fontWeight: '700',
  },
  description: {
    marginTop: 12,
    color: '#69717C',
    fontSize: 15,
  },
});
