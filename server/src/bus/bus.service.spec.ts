import { BusService } from './bus.service';
import { TileCacheService } from './cache/tile-cache.service';
import type { StationRepository } from './stations/station.repository';

describe('BusService', () => {
  it('지도 요청은 저장된 정류장만 조회하며 같은 타일 요청을 재사용한다', async () => {
    const stations = [{ id: 'station-1', name: '역곡역' }];
    const repository = {
      findNearby: jest.fn().mockResolvedValue(stations),
    } as unknown as StationRepository;
    const service = new BusService(repository, new TileCacheService());

    await expect(service.getNearbyStations(37.4883, 126.8169, 250)).resolves.toEqual(stations);
    await service.getNearbyStations(37.4883, 126.8169, 250);

    expect(repository.findNearby).toHaveBeenCalledTimes(1);
    expect(repository.findNearby).toHaveBeenCalledWith(37.4883, 126.8169, 250);
  });
});
