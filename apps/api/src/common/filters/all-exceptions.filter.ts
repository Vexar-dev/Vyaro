import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Every error leaving the API goes through here. Clients only ever see
 * { success: false, error: { code, message } } — never a stack trace, never
 * an internal exception message, never a raw Prisma/DB error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'حدث خطأ غير متوقع';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'code' in (body as any)) {
        code = (body as any).code;
        message = (body as any).message ?? message;
      } else {
        code = HttpStatus[status] ?? 'ERROR';
        message = typeof body === 'string' ? body : message;
      }
    }

    // Full detail goes to internal structured logs only — never to the response body.
    this.logger.error(
      JSON.stringify({
        requestId,
        path: request.url,
        status,
        code,
        // NEVER log request bodies here: they may contain passwords/tokens.
        exceptionName: exception instanceof Error ? exception.name : typeof exception,
      }),
    );

    response.status(status).json({
      success: false,
      error: { code, message },
      requestId,
    });
  }
}
