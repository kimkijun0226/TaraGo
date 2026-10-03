import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { StationRepository } from './station.repository';
import { readTagoStationCsv } from './station-import';

@Injectable()
export class StationImportService {
  private readonly logger = new Logger(StationImportService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly stations: StationRepository,
  ) {}

  async importConfiguredSnapshot(): Promise<number> {
    const path = this.config.get<string>('BUS_STATIONS_CSV_PATH');
    if (!path) throw new Error('BUS_STATIONS_CSV_PATH를 설정해 주세요.');
    const minimumRows = Number(this.config.get<string>('BUS_STATIONS_MIN_ROWS') ?? '100000');
    if (!Number.isInteger(minimumRows) || minimumRows < 1) {
      throw new Error('BUS_STATIONS_MIN_ROWS는 1 이상의 정수여야 합니다.');
    }
    const snapshotId = randomUUID();

    const result = await this.stations.importSnapshot(
      readTagoStationCsv(
        path,
        this.config.get<string>('BUS_STATIONS_CSV_ENCODING') ?? 'utf-8',
      ),
      minimumRows,
      snapshotId,
    );
    this.logger.log(`정류장 적재 완료: ${result.imported}개, 이전 CSV 출처 정리: ${result.removed}개`);
    return result.imported;
  }
}
