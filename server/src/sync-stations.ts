import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { StationImportService } from './bus/stations/station-import.service';

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
