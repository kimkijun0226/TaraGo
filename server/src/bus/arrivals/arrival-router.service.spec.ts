import type { StationRepository } from '../stations/station.repository';
import { ArrivalCacheService } from './arrival-cache.service';
import { ArrivalRouterService } from './arrival-router.service';
import type { GyeonggiArrivalProvider } from './gyeonggi-arrival.provider';
import type { TagoArrivalProvider } from './tago-arrival.provider';

describe('ArrivalRouterService', () => {
  it('저장된 TAGO source ID와 도시코드로 도착정보를 조회한다', async () => {
    const stations = {
      findStation: jest.fn().mockResolvedValue({ arsId: null, latitude: 0, longitude: 0 }),
      findSources: jest.fn().mockResolvedValue([
        {
          provider: 'TAGO',
          providerStationId: 'GGB123',
          providerCityCode: '31050',
        },
      ]),
    } as unknown as StationRepository;
    const tago = {
      fetchArrivals: jest.fn().mockResolvedValue([]),
    } as unknown as TagoArrivalProvider;
    const service = new ArrivalRouterService(
      stations,
      tago,
      new ArrivalCacheService(),
      { findStationId: jest.fn().mockResolvedValue(null) } as unknown as GyeonggiArrivalProvider,
    );

    await expect(service.getArrivals('station-1')).resolves.toEqual([]);
    expect(tago.fetchArrivals).toHaveBeenCalledWith('31050', 'GGB123');
  });

  it('좌표가 일치하는 경기도 정류장은 경유노선 포함 응답을 사용한다', async () => {
    const stations = {
      findStation: jest.fn().mockResolvedValue({ arsId: '11400', latitude: 37.4886167, longitude: 126.8168667 }),
      findSources: jest.fn().mockResolvedValue([{ provider: 'TAGO', providerStationId: 'GGB123', providerCityCode: '31050' }]),
    } as unknown as StationRepository;
    const tago = { fetchArrivals: jest.fn().mockResolvedValue([]) } as unknown as TagoArrivalProvider;
    const gyeonggi = {
      findStationId: jest.fn().mockResolvedValue(210000279),
      fetchArrivals: jest.fn().mockResolvedValue([{ routeId: '52', busNumber: '52', etaSeconds: 59 }]),
    } as unknown as GyeonggiArrivalProvider;
    const service = new ArrivalRouterService(stations, tago, new ArrivalCacheService(), gyeonggi);

    await expect(service.getArrivals('station-11400')).resolves.toMatchObject([{ busNumber: '52' }]);
    expect(gyeonggi.fetchArrivals).toHaveBeenCalledWith(210000279);
    expect(tago.fetchArrivals).not.toHaveBeenCalled();
  });
});
