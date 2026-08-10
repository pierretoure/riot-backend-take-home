import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { parseSignRequest } from './dto/sign-request.dto';
import type { SignResponseDto } from './dto/sign-response.dto';
import { parseVerifyRequest } from './dto/verify-request.dto';
import { SignatureService } from './signature.service';

@Controller()
export class SignatureController {
  constructor(private readonly signatureService: SignatureService) {}

  @Post('sign')
  @HttpCode(HttpStatus.OK)
  sign(@Body() body: unknown): SignResponseDto {
    const payload = parseSignRequest(body);
    return { signature: this.signatureService.sign(payload) };
  }

  @Post('verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  verify(@Body() body: unknown): void {
    const { signature, data } = parseVerifyRequest(body);

    if (!this.signatureService.verify(data, signature)) {
      throw new BadRequestException('Signature is invalid');
    }
  }
}
