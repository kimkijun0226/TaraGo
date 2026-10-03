import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseCsvRow, readTagoStationCsv } from './station-import';

describe('TAGO CSV import', () => {
  it('쉼표와 따옴표가 있는 셀을 보존한다', () => {
    expect(parseCsvRow('a,"b,c","d""e"')).toEqual(['a', 'b,c', 'd"e']);
  });

  it('공식 헤더에서 유효한 정류장만 읽는다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tarago-stations-'));
    const path = join(directory, 'stations.csv');
    try {
      await writeFile(path, [
        'NODE_ID,NODE_NM,GPS_LATI,GPS_LONG,CITY_CD,NODE_MOBILE_ID',
        'node-1,"역곡역, 남쪽",37.4883,126.8169,31050,12345',
        'node-2,좌표 없음,,,31050,',
      ].join('\n'));

      const stations = [];
      for await (const station of readTagoStationCsv(path)) stations.push(station);
      expect(stations).toEqual([{
        provider: 'TAGO',
        providerStationId: 'node-1',
        providerCityCode: '31050',
        arsId: '12345',
        name: '역곡역, 남쪽',
        latitude: 37.4883,
        longitude: 126.8169,
      }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('배포된 CSV의 한글 헤더도 읽는다', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tarago-stations-'));
    const path = join(directory, 'stations.csv');
    try {
      const header = '정류장번호,정류장명,위도,경도,정보수집일,모바일단축번호,도시코드,도시명,관리도시명';
      await writeFile(path, `${header}\nnode-1,역곡역,37.4883,126.8169,2025-10-31,12345,31050,부천시,부천BIS\n`, 'utf-8');
      const stations = [];
      for await (const station of readTagoStationCsv(path)) stations.push(station);
      expect(stations).toEqual([{
        provider: 'TAGO',
        providerStationId: 'node-1',
        providerCityCode: '31050',
        arsId: '12345',
        name: '역곡역',
        latitude: 37.4883,
        longitude: 126.8169,
      }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
