import { ConfigService } from '@nestjs/config';
import { BusService } from './bus.service';

describe('BusService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('미정차 정류장과 요청 반경 밖 정류장을 제외한다', async () => {
    const configService = {
      getOrThrow: jest.fn((key: string) => {
        if (key !== 'PUBLIC_DATA_SERVICE_KEY') {
          throw new Error(`unexpected config key: ${key}`);
        }

        return 'decoded%2Bservice%2Fkey';
      }),
    } as unknown as ConfigService;

    const service = new BusService(configService);

    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          msgHeader: {
            headerCd: '0',
            headerMsg: '정상적으로 처리되었습니다.',
          },
          msgBody: {
            itemList: [
              {
                stationId: 'station-1',
                arsId: '01234',
                stationNm: '정상 정류장',
                gpsX: '126.977',
                gpsY: '37.566',
                dist: '100',
                stationTp: '0',
              },
              {
                stationId: 'station-2',
                arsId: '0',
                stationNm: '미정차 정류장',
                gpsX: '126.978',
                gpsY: '37.567',
                dist: '200',
                stationTp: '0',
              },
              {
                stationId: 'station-3',
                arsId: '05678',
                stationNm: '반경 밖 정류장',
                gpsX: '126.979',
                gpsY: '37.568',
                dist: '600',
                stationTp: '0',
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const result = await service.getNearbyStations(37.566535, 126.9779692, 500);

    const requestedUrl = new URL(
      (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0][0].toString(),
    );

    expect(result).toEqual([
      {
        id: 'station-1',
        arsId: '01234',
        name: '정상 정류장',
        latitude: 37.566,
        longitude: 126.977,
        distanceMeters: 100,
        type: '0',
      },
    ]);
    expect(configService.getOrThrow).toHaveBeenCalledWith(
      'PUBLIC_DATA_SERVICE_KEY',
    );
    expect(requestedUrl.searchParams.get('serviceKey')).toBe(
      'decoded+service/key',
    );
  });
});
