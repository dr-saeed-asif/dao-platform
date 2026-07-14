import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { ApplicationError } from '@dao-platform/application';
import { DomainRuleError } from '@dao-platform/domain';
import type { FastifyReply } from 'fastify';

@Catch(ApplicationError, DomainRuleError)
export class ApplicationExceptionFilter implements ExceptionFilter {
  catch(exception: ApplicationError | DomainRuleError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const status = statusFor(exception.code);
    response.status(status).send({
      statusCode: status,
      code: exception.code,
      message: exception.message,
    });
  }
}

function statusFor(code: string): number {
  if (code === 'FORBIDDEN') return HttpStatus.FORBIDDEN;
  if (code === 'PROPOSAL_NOT_FOUND') return HttpStatus.NOT_FOUND;
  if (
    code === 'IDEMPOTENCY_KEY_CONFLICT' ||
    code === 'PROPOSAL_ALREADY_PUBLISHED' ||
    code === 'DUPLICATE_MEMBER' ||
    code === 'ALREADY_VOTED'
  )
    return HttpStatus.CONFLICT;
  if (code === 'TRANSACTION_NOT_CONFIRMED') return HttpStatus.ACCEPTED;
  return HttpStatus.BAD_REQUEST;
}
