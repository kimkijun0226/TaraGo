import { memo, useCallback } from 'react';
import { NaverMapMarkerOverlay } from '@mj-studio/react-native-naver-map';
import type { BusRouteDetail } from '../api/get-bus-route-detail';

const IMAGE = require('../../../../assets/images/bus-stop-route-marker.png');
type Stop = BusRouteDetail['stops'][number];

/** 지도 카메라가 이동해도 정류소 데이터가 같으면 네이티브 마커를 다시 그리지 않는다. */
export const RouteBusStopMarker = memo(function RouteBusStopMarker({ stop, onSelect }: {
  stop: Stop; onSelect: (stop: Stop) => void;
}) {
  const handleTap = useCallback(() => onSelect(stop), [onSelect, stop]);
  return <NaverMapMarkerOverlay
    latitude={stop.latitude} longitude={stop.longitude} image={IMAGE}
    onTap={handleTap} width={24} height={24} anchor={{ x: .5, y: .5 }}
    caption={{
      text: `${stop.name}${stop.mobileNo && stop.mobileNo !== '0' ? `\n${stop.mobileNo.trim()}` : ''}`,
      align: 'Bottom', offset: 3, textSize: 10, requestedWidth: 120,
      color: '#343A40', haloColor: '#FFFFFF', minZoom: 18,
    }}
    isHideCollidedSymbols globalZIndex={200000} minZoom={13} isMinZoomInclusive zIndex={4}
  />;
});
