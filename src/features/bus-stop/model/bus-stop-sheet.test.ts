import assert from 'node:assert/strict';
import test from 'node:test';

import { getBusStopSheetDetails } from './bus-stop-sheet.ts';

test('정류장 이름과 정류장 번호를 바텀시트 문구로 만든다', () => {
  assert.deepEqual(
    getBusStopSheetDetails({ name: '역곡1동행정복지센터', arsId: '12345' }),
    {
      title: '역곡1동행정복지센터',
      subtitle: '정류장 번호 12345',
    },
  );
});

test('정류장 번호가 없으면 번호 없음으로 표시한다', () => {
  assert.equal(
    getBusStopSheetDetails({ name: '역곡역', arsId: null }).subtitle,
    '정류장 번호 없음',
  );
});
