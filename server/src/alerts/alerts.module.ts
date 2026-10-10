import { Module } from '@nestjs/common';
import { BusModule } from '../bus/bus.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertsWorker } from './alerts.worker';

@Module({ imports:[BusModule], controllers:[AlertsController], providers:[AlertsService,AlertsWorker] })
export class AlertsModule {}
