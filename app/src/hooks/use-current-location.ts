import * as Location from 'expo-location';
import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';

/** 네이버 지도 카메라와 위치 오버레이에 공통으로 사용하는 WGS84 좌표. */
export type Coordinate = {
  latitude: number;
  longitude: number;
};

/**
 * 현재 위치 권한 요청, 조회 상태, 마지막으로 얻은 좌표를 관리한다.
 *
 * 첫 화면 자동 조회와 내 위치 버튼 탭이 겹쳐도 위치 요청은 하나만 보낸다.
 */
export function useCurrentLocation() {
  const requestingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<Coordinate | null>(null);

  /**
   * foreground 권한과 기기 위치 서비스 상태를 확인한 뒤 현재 좌표를 조회한다.
   *
   * High 정확도는 정류장 수준의 지도가 필요하기 때문에 사용한다. 실패 이유는
   * 콘솔에 남기고 사용자에게는 위치 설정 확인 안내를 보여 준다.
   * @returns 조회한 WGS84 좌표. 권한 거부·서비스 비활성화·조회 오류·중복 요청이면 `null`.
   */
  const getCurrentLocation = useCallback(async (): Promise<Coordinate | null> => {
    /** 첫 화면 조회와 버튼 탭이 겹쳐도 위치 요청은 한 번만 실행한다. */
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

      /** 시뮬레이터의 대략적 위치보다 정류장 수준의 좌표를 우선한다. */
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
  }, []);

  return { getCurrentLocation, loading, position };
}
