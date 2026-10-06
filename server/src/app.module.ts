import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BusModule } from './bus/bus.module';
import { DatabaseModule } from './database/database.module';

/** 로컬 환경 설정, PostgreSQL, 버스 API 모듈을 Nest 앱에 연결한다. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.local',
    }),
    DatabaseModule,
    BusModule,
  ],
})
export class AppModule {}
