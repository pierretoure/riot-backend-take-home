import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

export interface HealthResponseDto {
  status: 'ok';
}

/**
 * `GET /health` (cahier des charges §8): a liveness probe used by the
 * Docker `HEALTHCHECK` and load balancers. Exempted from rate limiting
 * (`@SkipThrottle()`) — an orchestrator polling this endpoint frequently
 * must never itself be throttled — and from Swagger documentation, since it
 * is an infrastructure concern rather than part of the public API surface
 * described in the subject.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller()
export class HealthController {
  @Get('health')
  @HttpCode(HttpStatus.OK)
  check(): HealthResponseDto {
    return { status: 'ok' };
  }
}
