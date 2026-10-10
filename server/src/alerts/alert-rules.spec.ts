import { activeServiceDate, validateAlert, eligibleArrivals } from './alert-rules';

const input = { stationId: 'a06f0c28-6a67-4cff-87fc-928f065d2b5e', routeId: '12', stationSeq: 3, days: [1], startTime: '08:00', endTime: '09:00', thresholdMinutes: 5, enabled: true, proximityEnabled: true, radius: 200 };
describe('alert rules', () => {
  it('한국 시간과 선택한 요일·감시 범위로 활성 여부를 판정한다', () => {
    expect(activeServiceDate(input, new Date('2026-10-05T23:30:00+09:00'))).toBeNull();
    expect(activeServiceDate(input, new Date('2026-10-05T08:30:00+09:00'))).toBe('2026-10-05');
    expect(activeServiceDate(input, new Date('2026-10-06T08:30:00+09:00'))).toBeNull();
  });
  it('자정을 넘는 시간은 감시를 시작한 요일에 귀속한다', () => {
    const overnight = { ...input, startTime: '23:00', endTime: '01:00' };
    expect(activeServiceDate(overnight, new Date('2026-10-06T00:30:00+09:00'))).toBe('2026-10-05');
    expect(activeServiceDate(overnight, new Date('2026-10-06T01:00:00+09:00'))).toBeNull();
  });
  it('잘못된 시간·반경·임계값·요일과 문자열 boolean을 거부한다', () => {
    for (const change of [{ startTime: '25:00' }, { radius: 0 }, { thresholdMinutes: -1 }, { days: [] }, { enabled: 'yes' }, { endTime: '08:00' }]) {
      expect(() => validateAlert({ ...input, ...change })).toThrow();
    }
    expect(validateAlert(input)).toEqual(input);
  });
  it('선택한 방향의 유효 ETA가 임계값 이하인 차량만 알린다', () => {
    const base = { routeId: '12', stationSeq: 3, busNumber: '12', routeType: '', remainingStops: 1, vehicleType: '' };
    const arrivals = [{ ...base, etaSeconds: null }, { ...base, etaSeconds: -1 }, { ...base, etaSeconds: 301 }, { ...base, etaSeconds: 200, stationSeq: 4 }, { ...base, etaSeconds: 120, vehicleId: 'bus1' }];
    expect(eligibleArrivals(input, arrivals)).toEqual([arrivals[4]]);
    expect(eligibleArrivals({ ...input, enabled: false }, arrivals)).toEqual([]);
  });
});
