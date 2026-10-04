import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import type { StationSourceInput } from '../domain/bus-stop';

// 공공데이터포털 TAGO 정류소 CSV의 헤더를 그대로 사용한다.
const REQUIRED_COLUMNS = ['NODE_ID', 'NODE_NM', 'GPS_LATI', 'GPS_LONG'];
const COLUMN_ALIASES: Record<string, string> = {
  정류장번호: 'NODE_ID',
  정류장명: 'NODE_NM',
  위도: 'GPS_LATI',
  경도: 'GPS_LONG',
  모바일단축번호: 'NODE_MOBILE_ID',
  도시코드: 'CITY_CD',
};

export function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

/** 전국 정류소 CSV를 한 줄씩 읽어 DB 적재용 데이터로 변환한다. */
export async function* readTagoStationCsv(
  path: string,
  encoding = 'utf-8',
): AsyncGenerator<StationSourceInput> {
  const decoder = new TextDecoder(encoding);
  const chunks = createReadStream(path);
  const decoded = async function* () {
    for await (const chunk of chunks) yield decoder.decode(chunk, { stream: true });
    yield decoder.decode();
  };
  const lines = createInterface({ input: (await import('node:stream')).Readable.from(decoded()), crlfDelay: Infinity });
  let columns: Map<string, number> | undefined;

  for await (const line of lines) {
    if (!columns) {
      columns = new Map(parseCsvRow(line.replace(/^\uFEFF/, '')).map((name, index) => {
        const label = name.trim().toUpperCase();
        return [COLUMN_ALIASES[label] ?? label, index];
      }));
      const missing = REQUIRED_COLUMNS.filter((name) => !columns?.has(name));
      if (missing.length) throw new Error(`정류소 CSV 필수 열이 없습니다: ${missing.join(', ')}`);
      continue;
    }
    if (!line.trim()) continue;
    const cells = parseCsvRow(line);
    const columnIndex = columns;
    const get = (name: string) => cells[columnIndex.get(name) ?? -1]?.trim() ?? '';
    const latitudeText = get('GPS_LATI');
    const longitudeText = get('GPS_LONG');
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    if (
      !get('NODE_ID') || !get('NODE_NM') || !latitudeText || !longitudeText ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude)
    ) continue;
    yield {
      provider: 'TAGO',
      providerStationId: get('NODE_ID'),
      providerCityCode: get('CITY_CD') || undefined,
      arsId: get('NODE_MOBILE_ID') || undefined,
      name: get('NODE_NM'),
      latitude,
      longitude,
    };
  }
}
