import { BusService } from './bus.service';
import { TileCacheService } from './cache/tile-cache.service';
import type { SeoulStationProvider } from './providers/seoul-station.provider';
import type { TagoStationProvider } from './providers/tago-station.provider';
import type { StationRepository } from './stations/station.repository';

describe('BusService', () => {
  it('DB가 비었을 때 TAGO를 저장하고 서울 도시코드가 있을 때만 서울 API를 보강한다', async () => {
    const station = {
      id: 'station-1',
      arsId: '12345',
      name: '정류장',
      latitude: 37.5,
      longitude: 127,
      distanceMeters: 20,
      type: '0',
      providers: ['SEOUL', 'TAGO'] as const,
    };
    const repository = {
      findNearby: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([station]),
      upsertSource: jest.fn().mockResolvedValue('station-1'),
    } as unknown as StationRepository;
    const tago = {
      fetchNearby: jest.fn().mockResolvedValue([
        {
          provider: 'TAGO',
          providerStationId: 'TAGO-1',
          providerCityCode: '11',
          name: '정류장',
          latitude: 37.5,
          longitude: 127,
        },
      ]),
    } as unknown as TagoStationProvider;
    const seoul = {
      fetchNearby: jest.fn().mockResolvedValue([
        {
          provider: 'SEOUL',
          providerStationId: 'SEOUL-1',
          name: '정류장',
          latitude: 37.5,
          longitude: 127,
        },
      ]),
    } as unknown as SeoulStationProvider;
    const service = new BusService(repository, tago, seoul, new TileCacheService());

    await expect(service.getNearbyStations(37.5, 127, 250)).resolves.toEqual([
      station,
    ]);
    expect(tago.fetchNearby).toHaveBeenCalledTimes(1);
    expect(seoul.fetchNearby).toHaveBeenCalledTimes(1);
    expect(repository.upsertSource).toHaveBeenCalledTimes(2);
  });

  it('같은 타일 재요청은 DB와 외부 API를 다시 호출하지 않는다', async () => {
    const station = {
      id: 'station-1',
      arsId: null,
      name: '역곡역',
      latitude: 37.4883,
      longitude: 126.8169,
      distanceMeters: 20,
      type: '0',
      providers: ['TAGO'] as const,
    };
    const repository = {
      findNearby: jest.fn().mockResolvedValue([station]),
      upsertSource: jest.fn(),
    } as unknown as StationRepository;
    const tago = { fetchNearby: jest.fn() } as unknown as TagoStationProvider;
    const seoul = { fetchNearby: jest.fn() } as unknown as SeoulStationProvider;
    const service = new BusService(repository, tago, seoul, new TileCacheService());

    await service.getNearbyStations(37.4883, 126.8169, 250);
    await service.getNearbyStations(37.4883, 126.8169, 250);

    expect(repository.findNearby).toHaveBeenCalledTimes(1);
    expect(tago.fetchNearby).not.toHaveBeenCalled();
    expect(seoul.fetchNearby).not.toHaveBeenCalled();
  });
});
