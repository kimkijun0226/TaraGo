import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import { StationRepository } from './station.repository';
import { readTagoStationCsv } from './station-import';

/** 설정된 전국 정류장 CSV를 검증하고 저장소의 스냅샷 교체를 시작한다. */
@Injectable()
export class StationImportService {
  private readonly logger = new Logger(StationImportService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly stations: StationRepository,
  ) {}

  /**
   * CSV 경로·인코딩·최소 행 수를 읽고 이번 적재의 스냅샷 ID를 만든다.
   *
   * 잘못된 최소 행 수나 누락된 파일 경로는 DB 작업 전에 거부한다.
   * 실제 교체와 이전 데이터 보존 여부는 저장소의 트랜잭션이 보장한다.
   * @returns 유효하게 적재한 고유 정류장 행 수.
   * @throws 설정 오류, CSV 읽기 오류, 적재 실패를 호출자에게 전달한다.
   */
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
