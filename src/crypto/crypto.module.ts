import { Module } from '@nestjs/common';
import { Base64Cipher } from './adapters/base64.cipher';
import { CryptoController } from './crypto.controller';
import { CryptoService } from './crypto.service';
import { CIPHER } from './ports/cipher.port';

/**
 * Wires the crypto domain together. Swapping the encryption algorithm (e.g.
 * to `RotCipher`) requires changing only the `useClass` below —
 * `CryptoService` and `CryptoController` are unaffected.
 */
@Module({
  controllers: [CryptoController],
  providers: [{ provide: CIPHER, useClass: Base64Cipher }, CryptoService],
})
export class CryptoModule {}
