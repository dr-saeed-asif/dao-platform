import { CanActivate, GoneException, Injectable } from '@nestjs/common';

// Legacy local-only routes bypassed wallet membership checks. Keep them closed
// at the HTTP boundary; all new requests use the scoped assistant controller.
@Injectable()
export class RetiredAiGuard implements CanActivate {
  canActivate(): never {
    throw new GoneException('Use the authenticated proposal AI assistant.');
  }
}
