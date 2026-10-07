import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/** Nest HTTP 서버를 만들고 `PORT` 또는 기본 3000번 포트에서 요청을 받는다. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
