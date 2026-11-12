import { ValidationPipe } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApplicationExceptionFilter } from './common/application-exception.filter';

export function configureApp(app: NestFastifyApplication): void {
  const server = app.getHttpAdapter().getInstance();
  server.addHook('onRoute', (route) => {
    if (route.url === '/v1/cyberchain/rpc') route.bodyLimit = 65_536;
  });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApplicationExceptionFilter());
}
