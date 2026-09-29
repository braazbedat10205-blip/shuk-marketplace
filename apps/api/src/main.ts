import { validateEnvironment } from './environment';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import helmet from 'helmet';
import { AppModule } from './modules';
import { SafeExceptionFilter } from './safe-errors';
import { requestLogging } from './request-logging';

async function bootstrap() {
  validateEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  const uploadRoot=resolve(process.env.UPLOAD_ROOT??resolve(process.env.INIT_CWD??process.cwd(),'uploads'));mkdirSync(uploadRoot,{recursive:true});app.useStaticAssets(uploadRoot,{prefix:'/uploads/',setHeaders:(response)=>{response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Cache-Control','public, max-age=86400')}});
  app.setGlobalPrefix('api');
  app.use(requestLogging);
  app.use(helmet({strictTransportSecurity:process.env.NODE_ENV==='production'?{}:false,contentSecurityPolicy:false}));
  const allowedOrigins=(process.env.WEB_ORIGIN??'http://localhost:3000').split(',').map(value=>value.trim()).filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: true,methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization','Idempotency-Key','X-Request-Id'],exposedHeaders:['X-Request-Id'] });
  app.useGlobalFilters(new SafeExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(Number(process.env.PORT ?? 4000));
}
bootstrap();
