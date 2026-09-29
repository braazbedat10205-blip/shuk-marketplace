import {Controller,Get,Injectable,NotFoundException,Param,ParseUUIDPipe,UseGuards} from '@nestjs/common';
import {AuthUser,CurrentUser,JwtAuthGuard} from './auth';
import {PrismaService} from './prisma';
import {resolvePaymentPageState} from './payment-state';

@Injectable()
export class PaymentsService {
  constructor(private readonly db:PrismaService){}
  async orderForPayment(userId:string,orderId:string){
    const order=await this.db.order.findFirst({where:{id:orderId,userId},select:{id:true,orderNumber:true,status:true,currency:true,totalAgorot:true,shippingAddress:true,createdAt:true,payment:{select:{status:true}},sellerOrders:{select:{subtotalAgorot:true,shippingAgorot:true,seller:{select:{store:{select:{name:true}}}},items:{select:{id:true,productName:true,sku:true,variantName:true,quantity:true,unitPriceAgorot:true,discountAgorot:true}}}}}});
    if(!order)throw new NotFoundException('ההזמנה לא נמצאה');
    const subtotalAgorot=order.sellerOrders.reduce((sum,group)=>sum+group.subtotalAgorot,0);
    const shippingAgorot=order.totalAgorot-subtotalAgorot;
    return {id:order.id,orderNumber:order.orderNumber,state:resolvePaymentPageState(order.status,order.payment?.status),orderStatus:order.status,paymentStatus:order.payment?.status??null,currency:order.currency,subtotalAgorot,shippingAgorot,totalAgorot:order.totalAgorot,shippingAddress:order.shippingAddress,createdAt:order.createdAt,items:order.sellerOrders.flatMap(group=>group.items.map(item=>({...item,sellerName:group.seller.store?.name??'חנות מקומית'})))};
  }
}

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments:PaymentsService){}
  @Get('orders/:orderId') order(@CurrentUser() user:AuthUser,@Param('orderId',new ParseUUIDPipe()) orderId:string){return this.payments.orderForPayment(user.sub,orderId)}
}
