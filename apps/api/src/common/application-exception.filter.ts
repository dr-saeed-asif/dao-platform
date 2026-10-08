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
    code === 'PROPOSAL_ALREADY_FINALIZED' ||
    code === 'DUPLICATE_MEMBER' ||
    code === 'ALREADY_VOTED'
  )
    return HttpStatus.CONFLICT;
  if (code === 'TRANSACTION_NOT_CONFIRMED') return HttpStatus.ACCEPTED;
  if (code === 'INVALID_VOTING_PERIOD' || code === 'TRANSACTION_REVERTED') {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
  if (code === 'CHAIN_EVENT_MISSING') return HttpStatus.BAD_GATEWAY;
  return HttpStatus.BAD_REQUEST;
}
