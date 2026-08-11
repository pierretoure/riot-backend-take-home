import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

export interface HealthResponseDto {
  status: 'ok';
}

// Exempted from rate limiting: an orchestrator polling this endpoint
// frequently must never itself be throttled.
@SkipThrottle()
@ApiTags('health')
@Controller()
export class HealthController {
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Used by the Docker HEALTHCHECK and load balancers. Not rate limited.',
  })
  @ApiResponse({
    status: 200,
    description: 'The application is up.',
    schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['ok'] } },
      example: { status: 'ok' },
    },
  })
  check(): HealthResponseDto {
    return { status: 'ok' };
  }
}
