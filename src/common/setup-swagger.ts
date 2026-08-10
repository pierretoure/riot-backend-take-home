import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Mounts the OpenAPI document (cahier des charges §7): an interactive UI on
 * `/docs` and the raw JSON on `/docs-json`. Built from decorators on the
 * controllers rather than a hand-maintained spec, so it cannot drift from
 * the actual routes.
 *
 * Extracted from `src/main.ts` (mirroring `applyGlobalConfig`) so that
 * integration tests exercise the exact same document-building code as
 * production, e.g. to assert that no secret ever appears in `/docs-json`.
 */
export function setupSwagger(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Riot Backend Take-Home API')
    .setDescription(
      'Encryption, decryption, signing and verification of arbitrary JSON payloads.',
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
