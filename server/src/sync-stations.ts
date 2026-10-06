import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { StationImportService } from './bus/stations/station-import.service';

/**
 * HTTP 서버를 열지 않고 전국 CSV 적재 서비스만 실행한다.
 *
 * 작업이 성공하거나 실패해도 Nest 컨텍스트와 DB 연결을 닫아
 * 일회성 적재 명령이 종료되도록 한다.
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await app.get(StationImportService).importConfiguredSnapshot();
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
