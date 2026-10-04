import * as Location from 'expo-location';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export function useCurrentLocation() {
  const requestingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<Coordinate | null>(null);

  async function getCurrentLocation(): Promise<Coordinate | null> {
    // 첫 화면 조회와 버튼 탭이 겹쳐도 위치 요청은 한 번만 실행한다.
    if (requestingRef.current) return null;

    requestingRef.current = true;
    setLoading(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          '위치 권한이 필요해요',
          permission.canAskAgain
            ? '위치 권한을 허용하면 내 위치로 이동할 수 있어요.'
            : '기기 설정에서 TaraGo의 위치 권한을 허용해주세요.',
        );
        return null;
      }

      if (!(await Location.hasServicesEnabledAsync())) {
        Alert.alert('위치 서비스가 꺼져 있어요', '기기의 위치 서비스를 켜주세요.');
        return null;
      }

      // 정류장 주변 지도를 보여줄 때 필요한 정확도를 요청한다.
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coordinate = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setPosition(coordinate);
      return coordinate;
    } catch (error) {
      console.warn('현재 위치 조회 실패:', error);
      Alert.alert(
        '위치를 찾지 못했어요',
        '위치 설정을 확인하고 내 위치 버튼을 다시 눌러주세요.',
      );
      return null;
    } finally {
      requestingRef.current = false;
      setLoading(false);
    }
  }

  return { getCurrentLocation, loading, position };
}
