import { Global, Module } from '@nestjs/common';

import { DatabaseService } from './database.service';

/** 여러 서버 모듈에서 같은 PostgreSQL 연결 풀을 사용하도록 제공한다. */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
