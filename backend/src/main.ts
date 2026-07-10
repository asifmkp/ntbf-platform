import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Disable Nest's built-in body parser (default 100kb limit) so we can register
  // our own with a larger limit below. Without this, the default 100kb parser
  // runs first and rejects phone-photo uploads with PayloadTooLargeError.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Bill capture POSTs phone photos to /api/bills/extract as base64 JSON, which
  // easily exceeds the old 100kb default. Allow normal phone photos (15mb).
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  // CORS: restrict to CORS_ORIGIN (comma-separated) in production; allow all if unset (dev).
  const origins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true });

  const config = new DocumentBuilder()
    .setTitle('Foodstuffs Trading Application API')
    .setDescription('Single role-based platform with integrated ERP (TRD v1.0)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Foodstuffs API running on http://localhost:${port}  (Swagger: /docs)`);
}
bootstrap();
