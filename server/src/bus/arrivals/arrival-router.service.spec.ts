import type { StationRepository } from '../stations/station.repository';
import { ArrivalCacheService } from './arrival-cache.service';
import { ArrivalRouterService } from './arrival-router.service';
import type { TagoArrivalProvider } from './tago-arrival.provider';

describe('ArrivalRouterService', () => {
  it('저장된 TAGO source ID와 도시코드로 도착정보를 조회한다', async () => {
    const stations = {
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
    );

    await expect(service.getArrivals('station-1')).resolves.toEqual([]);
    expect(tago.fetchArrivals).toHaveBeenCalledWith('31050', 'GGB123');
  });
});
