import {ArgumentsHost,Catch,ExceptionFilter,PayloadTooLargeException} from '@nestjs/common';
@Catch(PayloadTooLargeException)
export class UploadSizeFilter implements ExceptionFilter{
 catch(_error:PayloadTooLargeException,host:ArgumentsHost){host.switchToHttp().getResponse<{status:(code:number)=>{json:(body:unknown)=>void}}>().status(400).json({statusCode:400,message:'גודל התמונה חורג מהמגבלה של 10MB',error:'Bad Request'});}
}
