type BusStopSheetSource = {
  name: string;
  arsId: string | null;
};

export function getBusStopSheetDetails(busStop: BusStopSheetSource) {
  return {
    title: busStop.name,
    subtitle: busStop.arsId
      ? `정류장 번호 ${busStop.arsId}`
      : '정류장 번호 없음',
  };
}
