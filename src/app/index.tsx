import {
  NaverMapView,
  type NaverMapViewRef,
} from "@mj-studio/react-native-naver-map";
import { SymbolView } from "expo-symbols";
import { useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCurrentLocation } from "@/hooks/use-current-location";

const DEFAULT_CAMERA = {
  latitude: 37.5665,
  longitude: 126.978,
  zoom: 15,
};

export default function MapScreen() {
  const mapRef = useRef<NaverMapViewRef>(null);
  const initializedRef = useRef(false);
  const { getCurrentLocation, loading, position } = useCurrentLocation();
  const insets = useSafeAreaInsets();

  async function moveToMyLocation() {
    if (!initializedRef.current) return;

    const coordinate = await getCurrentLocation();
    if (!coordinate) return;

    mapRef.current?.animateCameraTo({
      ...coordinate,
      zoom: 16,
      duration: 500,
    });
  }

  return (
    <View style={styles.container}>
      <NaverMapView
        ref={mapRef}
        style={styles.container}
        initialCamera={DEFAULT_CAMERA}
        isShowLocationButton={false}
        isShowZoomControls={false}
        locationOverlay={{
          isVisible: position !== null,
          position: position ?? DEFAULT_CAMERA,
        }}
        onInitialized={() => {
          // 지도 준비 이후에만 초기 위치로 카메라를 이동할 수 있다.
          if (initializedRef.current) return;
          initializedRef.current = true;
          void moveToMyLocation();
        }}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="현재 위치로 지도 이동"
        accessibilityState={{ disabled: loading, busy: loading }}
        disabled={loading}
        onPress={() => void moveToMyLocation()}
        style={({ pressed }) => [
          styles.locationButton,
          { bottom: insets.bottom + 16 },
          pressed && styles.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#1769E0" />
        ) : (
          <SymbolView
            name={{
              ios: "location.north.fill",
              android: "my_location",
              web: "my_location",
            }}
            size={24}
            tintColor="#1769E0"
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  locationButton: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DADCE0",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
});
