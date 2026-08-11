import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { JsonObject } from '../common/json/json.types';
import { JsonPayloadPipe } from '../common/pipes/json-payload.pipe';
import { CryptoService } from './crypto.service';

@ApiTags('crypto')
@Controller()
export class CryptoController {
  constructor(private readonly cryptoService: CryptoService) {}

  @Post('encrypt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Encrypt every depth-1 property of an arbitrary JSON payload',
    description:
      'Each top-level property is encoded as base64(JSON.stringify(value)).',
  })
  @ApiBody({
    description: 'Any JSON object.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        name: 'John Doe',
        age: 30,
        contact: {
          email: 'john@example.com',
          phone: '123-456-7890',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Encrypted payload; every value is a string.',
    schema: {
      type: 'object',
      additionalProperties: { type: 'string' },
      example: {
        name: 'some_encrypted_value',
        age: 'some_encrypted_value',
        contact: 'some_encrypted_value',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Malformed or non-object body.' })
  @ApiResponse({
    status: 413,
    description: 'Request body exceeds the 100kb size limit.',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
  encrypt(@Body(JsonPayloadPipe) body: JsonObject): JsonObject {
    return this.cryptoService.encryptPayload(body);
  }

  @Post('decrypt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decrypt every depth-1 property previously produced by /encrypt',
    description:
      'Properties detected as encrypted are decoded and reparsed; any other property is left strictly unchanged.',
  })
  @ApiBody({
    description: 'Any JSON object, typically the output of /encrypt.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        name: 'some_encrypted_value',
        age: 'some_encrypted_value',
        contact: 'some_encrypted_value',
        birth_date: '1998-11-19',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Decrypted payload.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        name: 'John Doe',
        age: 30,
        contact: {
          email: 'john@example.com',
          phone: '123-456-7890',
        },
        birth_date: '1998-11-19',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Malformed or non-object body.' })
  @ApiResponse({
    status: 413,
    description: 'Request body exceeds the 100kb size limit.',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
  decrypt(@Body(JsonPayloadPipe) body: JsonObject): JsonObject {
    return this.cryptoService.decryptPayload(body);
  }
}
