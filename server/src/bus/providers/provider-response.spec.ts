import { parseSeoulStations } from './seoul-station.provider';
import { parseTagoStations } from './tago-station.provider';

describe('station provider parsers', () => {
  it('TAGO singleton과 빈 응답을 정규화한다', () => {
    expect(
      parseTagoStations({
        response: {
          header: { resultCode: '00', resultMsg: 'OK' },
          body: {
            items: {
              item: {
                nodeid: 'GGB123',
                nodenm: '역곡역',
                gpslati: 37.4883,
                gpslong: 126.8169,
                citycode: '31050',
              },
            },
          },
        },
      }),
    ).toEqual([
      {
        provider: 'TAGO',
        providerStationId: 'GGB123',
        providerCityCode: '31050',
        name: '역곡역',
        latitude: 37.4883,
        longitude: 126.8169,
        rawMetadata: expect.any(Object),
      },
    ]);
    expect(
      parseTagoStations({
        response: { header: { resultCode: '00' }, body: { items: '' } },
      }),
    ).toEqual([]);
  });

  it('서울 배열 응답과 잘못된 좌표를 정규화한다', () => {
    expect(
      parseSeoulStations({
        msgHeader: { headerCd: '0' },
        msgBody: {
          itemList: [
            {
              stationId: '100',
              arsId: '12345',
              stationNm: '서울 정류장',
              gpsY: '37.5',
              gpsX: '127.0',
              stationTp: '0',
              dist: '20',
            },
            {
              stationId: 'bad',
              arsId: '0',
              stationNm: '잘못된 정류장',
              gpsY: '',
              gpsX: '',
              stationTp: '0',
              dist: '30',
            },
          ],
        },
      }),
    ).toEqual([
      {
        provider: 'SEOUL',
        providerStationId: '100',
        arsId: '12345',
        name: '서울 정류장',
        latitude: 37.5,
        longitude: 127,
        type: '0',
        rawMetadata: expect.any(Object),
      },
    ]);
  });

  it('공급자 오류 응답은 빈 목록으로 숨기지 않는다', () => {
    expect(() =>
      parseTagoStations({
        response: { header: { resultCode: '30', resultMsg: 'KEY ERROR' } },
      }),
    ).toThrow('KEY ERROR');
    expect(() =>
      parseSeoulStations({ msgHeader: { headerCd: '1', headerMsg: 'ERROR' } }),
    ).toThrow('ERROR');
  });
});
