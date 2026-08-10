import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { JsonObject } from '../json/json.types';

/**
 * `/encrypt`, `/decrypt` and `/sign` accept "any JSON payload" (subject.md),
 * which rules out a class-validator DTO: `whitelist`/`forbidNonWhitelisted`
 * (applied globally, see `applyGlobalConfig`) would strip or reject every
 * property of a payload whose shape isn't known in advance. This pipe
 * instead enforces the one structural rule that *is* fixed regardless of
 * payload shape: the request body must be a JSON object (cahier des
 * charges §6 — "Racine non-objet (tableau ou scalaire) ... -> 400").
 *
 * Bound at the parameter level (`@Body(JsonPayloadPipe)`), it runs after the
 * global `ValidationPipe`, which is a no-op here since the controller
 * types its body parameter as `unknown`/a plain interface rather than a
 * validated class. Shared across the crypto and signature domains
 * (cahier des charges §6, harmonized in the app-assembly step).
 */
@Injectable()
export class JsonPayloadPipe implements PipeTransform<unknown, JsonObject> {
  transform(value: unknown): JsonObject {
    if (
      value === undefined ||
      value === null ||
      Array.isArray(value) ||
      typeof value !== 'object'
    ) {
      throw new BadRequestException('Request body must be a JSON object');
    }

    return value as JsonObject;
  }
}
