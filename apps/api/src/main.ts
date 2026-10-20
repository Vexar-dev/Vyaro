import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

// Prisma BigInt columns (ids, balances) can't be JSON.stringify'd by default — serialise them as strings.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  // rawBody:true additionally exposes request.rawBody (the exact bytes received)
  // WITHOUT changing how any existing route parses/consumes req.body — needed
  // by the Tatum webhook endpoint to verify HMAC-SHA512 signatures over the
  // exact bytes Tatum signed (see DepositMonitoringService.verifySignature).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Behind nginx/Cloudflare/a load balancer, req.ip is the PROXY's address unless this is set — which
  // makes every user share one throttling bucket and writes wrong IPs to sessions/audit logs.
  // TRUST_PROXY = number of proxy hops in front of the API (e.g. 1). Unset = not behind a proxy.
  if (process.env.TRUST_PROXY) (app as any).set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: 0, defaultVersion: '1' } as any); // URI versioning: /api/v1/...

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // strips unknown properties — never trust extra client fields
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: 422,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`VAYRO API listening on port ${port}`);
}

bootstrap();
