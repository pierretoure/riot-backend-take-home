import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { JsonObject } from '../common/json/json.types';
import { CryptoService } from './crypto.service';
import { JsonPayloadPipe } from './dto/json-payload.pipe';

/**
 * `/encrypt` and `/decrypt` (cahier des charges §4.1/§4.2). Contains no
 * business logic: request shape is enforced by `JsonPayloadPipe`, and the
 * actual encryption/decryption is delegated to `CryptoService`.
 */
@Controller()
export class CryptoController {
  constructor(private readonly cryptoService: CryptoService) {}

  @Post('encrypt')
  @HttpCode(HttpStatus.OK)
  encrypt(@Body(JsonPayloadPipe) body: JsonObject): JsonObject {
    return this.cryptoService.encryptPayload(body);
  }

  @Post('decrypt')
  @HttpCode(HttpStatus.OK)
  decrypt(@Body(JsonPayloadPipe) body: JsonObject): JsonObject {
    return this.cryptoService.decryptPayload(body);
  }
}
