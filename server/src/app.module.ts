import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BusModule } from './bus/bus.module';
import { DatabaseModule } from './database/database.module';

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
