import { NaverMapMarkerOverlay } from "@mj-studio/react-native-naver-map";

import type { BusStop } from "@/features/bus-stop/api/get-nearby-bus-stops";

const BUS_STOP_MARKER_IMAGE = require("../../../../assets/images/bus-stop-marker.png");

type BusStopMarkerProps = {
  busStop: BusStop;
  onSelect: (busStop: BusStop) => void;
};

export function BusStopMarker({ busStop, onSelect }: BusStopMarkerProps) {
  return (
    <NaverMapMarkerOverlay
      latitude={busStop.latitude}
      longitude={busStop.longitude}
      width={20}
      height={20}
      anchor={{ x: 0.5, y: 0.5 }}
      image={BUS_STOP_MARKER_IMAGE}
      onTap={() => onSelect(busStop)}
    />
  );
}
