import { Body, Controller, Delete, Get, Headers, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { AlertsService } from './alerts.service';

/** 모든 알림 조회·변경은 해당 기기의 bearer 자격 증명을 검사한다. */
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}
  @Post('devices') register() { return this.alerts.registerDevice(); }
  @Get('devices/status') async status(@Headers('authorization') auth: string | undefined) {
    return this.alerts.pushStatus(await this.alerts.authenticate(auth));
  }
  @Put('devices/push-token') async push(@Headers('authorization') auth: string | undefined, @Body() body: {token?: unknown}) {
    return this.alerts.setPushToken(await this.alerts.authenticate(auth), body?.token);
  }
  @Get() async list(@Headers('authorization') auth: string | undefined) { return this.alerts.list(await this.alerts.authenticate(auth)); }
  @Post() async create(@Headers('authorization') auth: string | undefined, @Body() body: unknown) {
    return this.alerts.save(await this.alerts.authenticate(auth),body);
  }
  @Put(':id') async update(@Headers('authorization') auth: string | undefined, @Param('id',ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.alerts.save(await this.alerts.authenticate(auth),body,id);
  }
  @Delete(':id') async remove(@Headers('authorization') auth: string | undefined, @Param('id',ParseUUIDPipe) id: string) {
    return this.alerts.remove(await this.alerts.authenticate(auth),id);
  }
}
