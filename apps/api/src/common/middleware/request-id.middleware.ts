import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    (req as any).requestId = incoming && incoming.length <= 64 ? incoming : randomUUID();
    res.setHeader('x-request-id', (req as any).requestId);
    next();
  }
}
