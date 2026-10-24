import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { BlockchainVerificationService } from './blockchain-verification.service';

@Controller('ai/internal')
export class BlockchainVerificationController {
  constructor(
    private readonly service: BlockchainVerificationService,
    private readonly config: ConfigService,
  ) {}
  @Get('proposals/:id/verification')
  verify(
    @Param('id') id: string,
    @Query('dao_id') dao: string,
    @Headers('authorization') authorization?: string,
  ) {
    const expected = this.config.get<string>('AI_SERVER_TOKEN'),
      actual = authorization?.replace(/^Bearer /, '');
    if (
      !expected ||
      !actual ||
      Buffer.byteLength(expected) !== Buffer.byteLength(actual) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
    )
      throw new UnauthorizedException('Server authentication required.');
    if (!dao || !id || id.length > 120)
      throw new UnauthorizedException('DAO/proposal scope required.');
    return this.service.verify(id, dao);
  }
}
