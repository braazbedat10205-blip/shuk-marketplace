import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger=new Logger(SafeExceptionFilter.name);
  catch(error:unknown,host:ArgumentsHost){
    const response=host.switchToHttp().getResponse<{status(code:number):{json(body:unknown):void}}>();
    if(error instanceof HttpException){
      const status=error.getStatus(),value=error.getResponse();
      const source=typeof value==='string'?value:value as {message?:string|string[];error?:string};
      const message=typeof source==='string'?source:source.message??'Request failed';
      response.status(status).json({statusCode:status,message});return;
    }
    this.logger.error(error instanceof Error?`Unhandled ${error.constructor.name}`:'Unhandled API error',process.env.NODE_ENV==='production'?undefined:error instanceof Error?error.stack:undefined);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({statusCode:500,message:'Internal server error'});
  }
}
