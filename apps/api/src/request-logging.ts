import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type RequestLike = { header(name:string):string|undefined;method:string;path:string;route?:{path?:string} };
type ResponseLike = { statusCode:number;setHeader(name:string,value:string):void;on(event:'finish',listener:()=>void):void };

const logger = new Logger('HTTP');
const safeRequestId = /^[A-Za-z0-9._-]{8,128}$/;

export function requestLogging(request: RequestLike, response: ResponseLike, next: () => void) {
  const supplied = request.header('x-request-id');
  const requestId = supplied && safeRequestId.test(supplied) ? supplied : randomUUID();
  const started = process.hrtime.bigint();
  response.setHeader('X-Request-Id', requestId);

  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const status = response.statusCode;
    const category = status >= 500 ? 'server_error' : status >= 400 ? 'client_error' : 'success';
    logger.log(JSON.stringify({
      requestId,
      method: request.method,
      endpoint: request.route?.path ?? request.path,
      status,
      durationMs: Number(durationMs.toFixed(1)),
      category,
    }));
  });
  next();
}
