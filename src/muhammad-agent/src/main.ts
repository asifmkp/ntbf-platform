import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MuhammadAgentModule } from './muhammad-agent.module';

/**
 * Standalone bootstrap (Option A in muhammad-agent.module.ts).
 * Boots the agent as its own HTTP service: cron schedulers start automatically,
 * and the 360dialog webhook is served at POST /webhooks/whatsapp.
 */
async function bootstrap() {
  const logger = new Logger('Muhammad');
  const app = await NestFactory.create(MuhammadAgentModule, { cors: true });

  const config = app.get(ConfigService);
  const port = Number(config.get('PORT', 3005));
  const enabled = config.get('AGENT_ENABLED', 'true') === 'true';
  const zohoWrites = config.get('ZOHO_WRITES_ENABLED', 'false') === 'true';

  // Graceful shutdown so in-flight loop steps can settle.
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`Muhammad agent listening on :${port}`);
  logger.log(`  agent_enabled = ${enabled}  (false = dry-run, no external sends)`);
  logger.log(`  zoho_writes   = ${zohoWrites} (false = preview only, never writes Zoho)`);
  logger.log(`  webhook       = POST /webhooks/whatsapp`);
  if (!enabled) logger.warn('Running in DRY-RUN — safe to observe. Flip AGENT_ENABLED=true to go live.');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal boot error:', err);
  process.exit(1);
});
