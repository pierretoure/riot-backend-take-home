import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';

/**
 * Global configuration module. Loads `.env`, validates it fail-fast via
 * `validateEnv`, and caches the result so `ConfigService` reads do not
 * re-parse the environment on every access.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
