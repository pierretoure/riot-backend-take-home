import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { JsonObject } from '../common/json/json.types';
import { JsonPayloadPipe } from '../common/pipes/json-payload.pipe';
import type { SignResponseDto } from './dto/sign-response.dto';
import {
  VerifyRequestPipe,
  type VerifyRequestDto,
} from './dto/verify-request.dto';
import { SignatureService } from './signature.service';

/**
 * `/sign` and `/verify` (cahier des charges §4.3/§4.4). Contains no business
 * logic: request shape is enforced by `JsonPayloadPipe`/`VerifyRequestPipe`,
 * and the actual signing/verification is delegated to `SignatureService`.
 */
@ApiTags('signature')
@Controller()
export class SignatureController {
  constructor(private readonly signatureService: SignatureService) {}

  @Post('sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign an arbitrary JSON payload with HMAC-SHA256',
    description:
      'The signature is computed over the canonicalized payload, independent of property order (cahier des charges §4.3).',
  })
  @ApiBody({
    description: 'Any JSON object.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: { message: 'Hello World', timestamp: 1616161616 },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Exclusively a signature property.',
    schema: {
      type: 'object',
      properties: { signature: { type: 'string' } },
      example: { signature: 'a1b2c3d4e5f6g7h8i9j0...' },
    },
  })
  @ApiResponse({ status: 400, description: 'Malformed or non-object body.' })
  @ApiResponse({
    status: 413,
    description: 'Request body exceeds the 100kb size limit.',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
  sign(@Body(JsonPayloadPipe) body: JsonObject): SignResponseDto {
    return { signature: this.signatureService.sign(body) };
  }

  @Post('verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Verify a payload against a previously computed HMAC-SHA256 signature',
    description:
      'Recomputes the HMAC over the canonicalized `data` and compares it in constant time against `signature` (cahier des charges §4.4).',
  })
  @ApiBody({
    description: 'The signature to verify, and the data it was computed over.',
    schema: {
      type: 'object',
      properties: {
        signature: { type: 'string' },
        data: { type: 'object', additionalProperties: true },
      },
      required: ['signature', 'data'],
      example: {
        signature: 'a1b2c3d4e5f6g7h8i9j0...',
        data: { message: 'Hello World', timestamp: 1616161616 },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'Signature is valid.' })
  @ApiResponse({
    status: 400,
    description:
      'Malformed body, missing signature/data, or signature/payload mismatch.',
  })
  @ApiResponse({
    status: 413,
    description: 'Request body exceeds the 100kb size limit.',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
  verify(@Body(VerifyRequestPipe) body: VerifyRequestDto): void {
    const { signature, data } = body;

    if (!this.signatureService.verify(data, signature)) {
      throw new BadRequestException('Signature is invalid');
    }
  }
}
