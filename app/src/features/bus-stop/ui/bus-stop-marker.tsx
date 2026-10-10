import { memo, useCallback } from "react";
import { NaverMapMarkerOverlay } from "@mj-studio/react-native-naver-map";

import type { BusStop } from "@/features/bus-stop/api/get-nearby-bus-stops";

const BUS_STOP_MARKER_IMAGE = require("../../../../assets/images/bus-stop-marker.png");
const SELECTED_BUS_STOP_MARKER_IMAGE = require("../../../../assets/images/bus-stop-selected-marker.png");

const ROUTE_MARKER_IMAGE = require("../../../../assets/images/bus-stop-route-marker.png");
const ROUTE_SELECTED_MARKER_IMAGE = require("../../../../assets/images/bus-stop-route-selected-marker.png");

type BusStopMarkerProps = {
  busStop: BusStop;
  selected: boolean;
  onRoute?: boolean;
  onSelect: (busStop: BusStop) => void;
};

/**
 * 일반 정류장은 작은 버스 아이콘, 선택 정류장은 강조 핀으로 표시한다.
 * @param props.busStop 마커 좌표와 선택 시 전달할 정류장 정보.
 * @param props.selected 현재 선택된 정류장이면 강조 핀을 사용한다.
 * @param props.onSelect 사용자가 마커를 탭했을 때 실행할 콜백.
 */
export const BusStopMarker = memo(function BusStopMarker({
  busStop,
  selected,
  onRoute = false,
  onSelect,
}: BusStopMarkerProps) {
  const handleTap = useCallback(() => onSelect(busStop), [onSelect, busStop]);
  return (
    <NaverMapMarkerOverlay
      key={`${busStop.id}-${selected ? "selected" : "normal"}-${onRoute ? "route" : "default"}`}
      latitude={busStop.latitude}
      longitude={busStop.longitude}
      width={selected ? 40 : onRoute ? 24 : 20}
      height={selected ? 48 : onRoute ? 24 : 20}
      anchor={{ x: 0.5, y: selected ? 1 : 0.5 }}
      image={
        onRoute
          ? selected
            ? ROUTE_SELECTED_MARKER_IMAGE
            : ROUTE_MARKER_IMAGE
          : selected
            ? SELECTED_BUS_STOP_MARKER_IMAGE
            : BUS_STOP_MARKER_IMAGE
      }
      caption={{
        text: selected ? "" : `${busStop.name}${busStop.arsId && busStop.arsId !== "0" ? `\n${busStop.arsId}` : ""}`,
        align: "Bottom",
        offset: 3,
        textSize: 10,
        requestedWidth: 120,
        color: "#343A40",
        haloColor: "#FFFFFF",
        minZoom: 18,
      }}
      minZoom={15}
      isMinZoomInclusive
      isHideCollidedSymbols={selected || onRoute}
      globalZIndex={200000}
      zIndex={selected ? 10 : onRoute ? 4 : 0}
      onTap={handleTap}
    />
  );
});
