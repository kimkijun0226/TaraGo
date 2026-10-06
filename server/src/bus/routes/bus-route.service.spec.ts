import { NotFoundException } from '@nestjs/common';

import type { StationRepository } from '../stations/station.repository';
import type { GyeonggiArrivalProvider } from '../arrivals/gyeonggi-arrival.provider';

describe('BusRouteService', () => {
  const station = { arsId: '11399', latitude: 37.4884, longitude: 126.8162 };
  const stops = [
    { stationId: 210000019, stationSeq: 43, stationName: '역곡1동행정복지센터', x: 126.8162, y: 37.4884 },
    { stationId: 116000458, stationSeq: 39, stationName: '온수남부', turnYn: 'Y', x: 126.8245, y: 37.4918 },
    { stationId: 210000019, stationSeq: 12, stationName: '역곡1동행정복지센터', x: 126.8162, y: 37.4884 },
  ];

  it('선택한 정류장의 노선 순번으로 정확한 회차 후 경유 지점을 강조한다', async () => {
    const { BusRouteService } = await import('./bus-route.service');
    const stations = { findStation: jest.fn().mockResolvedValue(station) } as unknown as StationRepository;
    const gyeonggi = {
      findStationId: jest.fn().mockResolvedValue(210000019),
      getStationRoutes: jest.fn().mockResolvedValue([
        { routeId: 210000009, routeName: '52', routeTypeName: '일반버스', staOrder: 12 },
        { routeId: 210000009, routeName: '52', routeTypeName: '일반버스', staOrder: 43 },
      ]),
      getRouteStops: jest.fn().mockResolvedValue(stops),
      getRouteLine: jest.fn().mockResolvedValue([
        { lineSeq: 2, x: 126.82, y: 37.49 }, { lineSeq: 1, x: 126.81, y: 37.48 },
      ]),
      getRouteVehiclePositions: jest.fn().mockResolvedValue([{ vehId: 123, stationSeq: 41 }]),
    } as unknown as GyeonggiArrivalProvider;
    const service = new BusRouteService(stations, gyeonggi);

    const detail = await service.getDetail('selected-uuid', '210000009', 43);

    expect(detail).toMatchObject({ routeId: '210000009', busNumber: '52',
      selectedStationId: '210000019', selectedStationSeq: 43, turnStationSeq: 39 });
    expect(detail.stops.map((stop) => stop.stationSeq)).toEqual([12, 39, 43]);
    expect(detail.stops.filter((stop) => stop.stationId === '210000019')).toHaveLength(2);
    expect(detail.geometry).toEqual({ source: 'official', points: [
      { latitude: 37.48, longitude: 126.81 }, { latitude: 37.49, longitude: 126.82 },
    ] });
    expect(detail.vehicles).toEqual([{ vehicleId: '123', stationSeq: 41, positionSource: 'station_sequence' }]);
  });

  it('같은 버스 번호라도 선택 정류장에 없는 노선 ID는 거부한다', async () => {
    const { BusRouteService } = await import('./bus-route.service');
    const stations = { findStation: jest.fn().mockResolvedValue(station) } as unknown as StationRepository;
    const gyeonggi = {
      findStationId: jest.fn().mockResolvedValue(210000019),
      getStationRoutes: jest.fn().mockResolvedValue([{ routeId: 210000009, routeName: '52', staOrder: 43 }]),
    } as unknown as GyeonggiArrivalProvider;
    const service = new BusRouteService(stations, gyeonggi);

    await expect(service.getDetail('selected-uuid', '999999999', 43)).rejects.toThrow(NotFoundException);
  });
});
