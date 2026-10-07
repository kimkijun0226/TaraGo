import { estimateTurnaroundArrivals, findApproachingRouteStatus, parseGyeonggiArrivals } from './gyeonggi-arrival.provider';
import { GyeonggiArrivalProvider } from './gyeonggi-arrival.provider';
import type { ConfigService } from '@nestjs/config';

describe('경기도 정류장 노선·도착정보 결합', () => {
  it('서버의 이전 기록이 없어도 회차 후 차량 위치로 첫 도착을 유지한다', async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname;
      const body = path.includes('getBusStationViaRouteList')
        ? { busRouteList: [{ routeId: 52, routeName: '52', staOrder: 43 }] }
        : path.includes('getBusRouteStationList')
          ? { busRouteStationList: [
            { stationId: 100, stationSeq: 39, turnYn: 'Y', x: 126.8245, y: 37.4918 },
            { stationId: 101, stationSeq: 40, x: 126.8272, y: 37.4909 },
            { stationId: 102, stationSeq: 41, x: 126.8246, y: 37.4895 },
            { stationId: 103, stationSeq: 42, x: 126.8198, y: 37.4878 },
            { stationId: 104, stationSeq: 43, x: 126.8162, y: 37.4884 },
          ] }
          : path.includes('getBusLocationList')
            ? { busLocationList: [{ vehId: 111, stationSeq: 41 }, { vehId: 222, stationSeq: 32 }] }
            : path.includes('getBusArrivalItem') && url.searchParams.get('staOrder') === '39'
              ? { busArrivalItem: { routeId: 52, staOrder: 39,
                predictTimeSec1: 840, vehId1: 222, predictTimeSec2: 1500, vehId2: 333 } }
              : { busArrivalList: [] };
      return { ok: true, json: async () => ({ response: { msgHeader: { resultCode: 0 }, msgBody: body } }) } as Response;
    });
    try {
      const provider = new GyeonggiArrivalProvider({ getOrThrow: () => 'example' } as unknown as ConfigService);
      const arrivals = await provider.fetchArrivals(104);
      expect(arrivals.map((arrival) => arrival.vehicleId)).toEqual(['111', '222']);
      expect(arrivals[0].etaSource).toBe('turnaround_estimate');
    } finally {
      fetcher.mockRestore();
    }
  });

  it('첫 차량이 회차점을 지나 목록에서 사라져도 목표 정류장 전까지 ETA를 유지한다', async () => {
    let turnReads = 0;
    let firstPosition = 41;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname;
      const body = path.includes('getBusStationViaRouteList')
        ? { busRouteList: [{ routeId: 52, routeName: '52', staOrder: 43 }] }
        : path.includes('getBusRouteStationList')
          ? { busRouteStationList: [
            { stationId: 100, stationSeq: 39, turnYn: 'Y', x: 126.8245, y: 37.4918 },
            { stationId: 104, stationSeq: 43, x: 126.8162, y: 37.4884 },
          ] }
          : path.includes('getBusLocationList')
            ? { busLocationList: [{ vehId: 111, stationSeq: firstPosition }, { vehId: 222, stationSeq: 32 }] }
            : path.includes('getBusArrivalItem') && url.searchParams.get('staOrder') === '39'
              ? { busArrivalItem: ++turnReads === 1
                ? { routeId: 52, staOrder: 39, predictTimeSec1: 300, vehId1: 111,
                  predictTimeSec2: 840, vehId2: 222 }
                : { routeId: 52, staOrder: 39, predictTimeSec1: 830, vehId1: 222 } }
              : { busArrivalList: [] };
      return { ok: true, json: async () => ({ response: { msgHeader: { resultCode: 0 }, msgBody: body } }) } as Response;
    });
    try {
      const provider = new GyeonggiArrivalProvider({ getOrThrow: () => 'example' } as unknown as ConfigService);
      const beforeTurn = await provider.fetchArrivals(104);
      clock.mockReturnValue(1_011_000);
      const afterTurn = await provider.fetchArrivals(104);
      expect(afterTurn.map((arrival) => arrival.vehicleId)).toEqual(['111', '222']);
      expect(afterTurn[0].etaSeconds).toBeLessThan(beforeTurn[0].etaSeconds!);
      firstPosition = 44;
      clock.mockReturnValue(1_022_000);
      const passed = await provider.fetchArrivals(104);
      expect(passed.map((arrival) => arrival.vehicleId)).toEqual(['222']);
    } finally {
      fetcher.mockRestore();
      clock.mockRestore();
    }
  });

  it('목표 정류장 ETA가 비어도 회차점의 두 차량 ETA를 표시한다', async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const path = url.pathname;
      const body = path.includes('getBusStationViaRouteList')
        ? { busRouteList: [{ routeId: 52, routeName: '52', staOrder: 43 }] }
        : path.includes('getBusRouteStationList')
          ? { busRouteStationList: [
            { stationId: 100, stationSeq: 39, turnYn: 'Y', x: 126.8245, y: 37.4918 },
            { stationId: 104, stationSeq: 43, x: 126.8162, y: 37.4884 },
          ] }
          : path.includes('getBusArrivalItem') && url.searchParams.get('staOrder') === '39'
            ? { busArrivalItem: { routeId: 52, staOrder: 39,
              predictTimeSec1: 300, vehId1: 111, predictTimeSec2: 840, vehId2: 222 } }
            : { busArrivalList: [] };
      return { ok: true, json: async () => ({ response: { msgHeader: { resultCode: 0 }, msgBody: body } }) } as Response;
    });
    try {
      const provider = new GyeonggiArrivalProvider({ getOrThrow: () => 'example' } as unknown as ConfigService);
      const arrivals = await provider.fetchArrivals(104);
      expect(arrivals).toHaveLength(2);
      expect(arrivals.every((arrival) => arrival.etaSource === 'turnaround_estimate')).toBe(true);
    } finally {
      fetcher.mockRestore();
    }
  });

  it('회차점 ETA의 가까운 두 차량을 목표 정류장 도착예상으로 변환한다', () => {
    const stops = [
      { stationId: 100, stationSeq: 39, turnYn: 'Y', x: 126.8245, y: 37.4918 },
      { stationId: 101, stationSeq: 40, x: 126.8272, y: 37.4909 },
      { stationId: 102, stationSeq: 41, x: 126.8246, y: 37.4895 },
      { stationId: 103, stationSeq: 42, x: 126.8198, y: 37.4878 },
      { stationId: 104, stationSeq: 43, x: 126.8162, y: 37.4884 },
    ];
    const result = estimateTurnaroundArrivals(
      { routeId: 52, routeName: '52', staOrder: 43 }, 104, stops,
      { routeId: 52, staOrder: 39, predictTimeSec1: 300, predictTimeSec2: 840,
        vehId1: 111, vehId2: 222 },
      [],
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ busNumber: '52', etaSource: 'turnaround_estimate' });
    expect(result[0].etaSeconds).toBeGreaterThan(300);
    expect(result[1].etaSeconds).toBeGreaterThan(result[0].etaSeconds!);
  });

  it('회차점 ETA의 차량이 목표 정류장 공식 ETA에 있으면 중복하지 않는다', () => {
    const stops = [
      { stationId: 100, stationSeq: 39, turnYn: 'Y', x: 126.8245, y: 37.4918 },
      { stationId: 104, stationSeq: 43, x: 126.8162, y: 37.4884 },
    ];
    const result = estimateTurnaroundArrivals(
      { routeId: 52, routeName: '52', staOrder: 43 }, 104, stops,
      { routeId: 52, staOrder: 39, predictTimeSec1: 300, predictTimeSec2: 840,
        vehId1: 111, vehId2: 222 },
      [111],
    );
    expect(result).toHaveLength(1);
  });
  it('분 단위 예측도 보존하고 다른 방향의 예측은 섞지 않는다', () => {
    const result = parseGyeonggiArrivals(
      [{ routeId: 52, routeName: '52', staOrder: 43 }],
      [
        { routeId: 52, staOrder: 10, predictTimeSec1: 90 },
        { routeId: 52, staOrder: 43, predictTimeSec1: '', predictTime1: 8, predictTime2: '' },
      ],
    );
    expect(result).toMatchObject([{ etaSeconds: 480 }]);
    expect(result).toHaveLength(1);
  });
  it('목록 ETA가 비면 정확한 순번의 항목 ETA로 보완한다', async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      const body = url.pathname.includes('getBusStationViaRouteList')
        ? { busRouteList: [{ routeId: 52, routeName: '52', staOrder: 43 }] }
        : url.pathname.includes('getBusArrivalItem') && url.searchParams.get('staOrder') === '43'
          ? { busArrivalItem: { routeId: 52, staOrder: 43, predictTimeSec1: 156, locationNo1: 2 } }
          : {};
      return { ok: true, json: async () => ({ response: { msgHeader: { resultCode: 0 }, msgBody: body } }) } as Response;
    });
    try {
      const provider = new GyeonggiArrivalProvider({ getOrThrow: () => 'example' } as unknown as ConfigService);
      await expect(provider.fetchArrivals(210000019)).resolves.toMatchObject([
        { busNumber: '52', etaSeconds: 156, remainingStops: 2 },
      ]);
    } finally {
      fetcher.mockRestore();
    }
  });
  it('회차 전 차량과 회차 후 차량을 노선 순번으로 구분한다', () => {
    const stops = [
      { stationId: 116000458, stationSeq: 39, turnYn: 'Y' },
      { stationId: 210000019, stationSeq: 43, turnYn: 'N' },
    ];

    expect(findApproachingRouteStatus(210000019, stops, [{ vehId: 178, stationSeq: 37 }]))
      .toBe('before_turnaround');
    expect(findApproachingRouteStatus(210000019, stops, [{ vehId: 123, stationSeq: 42 }]))
      .toBe('on_route');
    expect(findApproachingRouteStatus(210000019, stops, [{ vehId: 87, stationSeq: 51 }]))
      .toBeUndefined();
    expect(findApproachingRouteStatus(210000019, stops, []))
      .toBeUndefined();
  });
  it('도착정보가 없는 노선도 남기고 첫째·둘째 차량을 구분한다', () => {
    const result = parseGyeonggiArrivals(
      [
        { routeId: 12, routeName: '12', routeTypeName: '일반버스' },
        { routeId: 52, routeName: '52', routeTypeName: '일반버스' },
      ],
      [{ routeId: 52, predictTimeSec1: 59, locationNo1: 1, predictTimeSec2: 862, locationNo2: 12 }],
    );

    expect(result.map((item) => [item.busNumber, item.etaSeconds])).toEqual([
      ['12', null], ['52', 59], ['52', 862],
    ]);
  });

  it('도착 차량이 없는 정상 응답에도 경유노선을 반환한다', async () => {
    const fetcher = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ response: { msgHeader: { resultCode: 0 }, msgBody: { busRouteList: [{ routeId: 12, routeName: '12' }] } } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ response: { msgHeader: { resultCode: 4 } } }) } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({ response: { msgHeader: { resultCode: 4 } } }) } as Response);
    try {
      const provider = new GyeonggiArrivalProvider({ getOrThrow: () => 'example' } as unknown as ConfigService);
      await expect(provider.fetchArrivals(210000279)).resolves.toMatchObject([
        { busNumber: '12', etaSeconds: null },
      ]);
    } finally {
      fetcher.mockRestore();
    }
  });

  it('ETA가 없으면 실제 노선 위치를 확인하고 회차 전 상태만 표시한다', async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      const body = path.includes('getBusStationViaRouteList')
        ? { busRouteList: [{ routeId: 52, routeName: '52' }] }
        : path.includes('getBusArrivalList')
          ? { busArrivalList: [] }
          : path.includes('getBusRouteStationList')
            ? { busRouteStationList: [
              { stationId: 116000458, stationSeq: 39, turnYn: 'Y' },
              { stationId: 210000019, stationSeq: 43, turnYn: 'N' },
            ] }
            : { busLocationList: [{ vehId: 178, stationSeq: 37 }] };
      return { ok: true, json: async () => ({ response: { msgHeader: { resultCode: 0 }, msgBody: body } }) } as Response;
    });
    try {
      const provider = new GyeonggiArrivalProvider({ getOrThrow: () => 'example' } as unknown as ConfigService);
      await expect(provider.fetchArrivals(210000019)).resolves.toMatchObject([
        { busNumber: '52', etaSeconds: null, serviceStatus: 'before_turnaround' },
      ]);
      await provider.fetchArrivals(210000019);
      expect(fetcher).toHaveBeenCalledTimes(5);
    } finally {
      fetcher.mockRestore();
    }
  });

  it('회차지 대기 중인 노선은 ETA 없이 대기 상태를 보존한다', () => {
    const result = parseGyeonggiArrivals(
      [{ routeId: 52, routeName: '52' }],
      [{ routeId: 52, flag: 'WAIT' }],
    );

    expect(result).toMatchObject([{ busNumber: '52', etaSeconds: null, serviceStatus: 'turnaround_waiting' }]);
  });
});
