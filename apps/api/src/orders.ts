import {BadRequestException,Body,ConflictException,Controller,Get,Injectable,NotFoundException,Param,ParseUUIDPipe,Patch,Query,UseGuards} from '@nestjs/common';
import {OrderStatus,PaymentStatus,Prisma,Role} from '@prisma/client';
import {IsEnum,IsInt,IsOptional,IsString,IsUUID,Max,Min} from 'class-validator';
import {Type} from 'class-transformer';
import {AuthUser,CurrentUser,JwtAuthGuard,RequireRoles} from './auth';
import {aggregateOrderStatus,canCustomerCancel,canSellerTransition} from './order-workflow';
import {PrismaService} from './prisma';
class SellerOrderStatusDto{@IsEnum(OrderStatus)status!:OrderStatus}
class AdminOrdersQueryDto{@IsOptional()@IsString()search?:string;@IsOptional()@IsEnum(OrderStatus)status?:OrderStatus;@IsOptional()@IsEnum(PaymentStatus)paymentStatus?:PaymentStatus;@IsOptional()@IsUUID()sellerId?:string;@IsOptional()@Type(()=>Number)@IsInt()@Min(1)page=1;@IsOptional()@Type(()=>Number)@IsInt()@Min(1)@Max(100)limit=20}
const orderDetailSelect={id:true,orderNumber:true,status:true,currency:true,totalAgorot:true,shippingAddress:true,createdAt:true,payment:{select:{status:true}},sellerOrders:{select:{id:true,status:true,subtotalAgorot:true,shippingAgorot:true,commissionAgorot:true,netAgorot:true,seller:{select:{businessName:true,store:{select:{name:true,slug:true}}}},items:{select:{id:true,productId:true,productName:true,sku:true,variantName:true,quantity:true,unitPriceAgorot:true,discountAgorot:true,product:{select:{images:{orderBy:{position:'asc' as const},take:1,select:{storageUrl:true,altText:true}}}}}}}}} satisfies Prisma.OrderSelect;

@Injectable()
export class OrdersService{
 constructor(private readonly db:PrismaService){}
 async customerOrder(userId:string,id:string){const order=await this.db.order.findFirst({where:{id,userId},select:orderDetailSelect});if(!order)throw new NotFoundException('ההזמנה לא נמצאה');return order}
 async cancelCustomerOrder(userId:string,id:string){
  return this.db.$transaction(async tx=>{
   const order=await tx.order.findFirst({where:{id,userId},select:{id:true,status:true,payment:{select:{status:true}},sellerOrders:{select:{items:{select:{sku:true,quantity:true}}}}}});if(!order)throw new NotFoundException('ההזמנה לא נמצאה');
   if(!canCustomerCancel(order.status,order.payment?.status))throw new ConflictException('לא ניתן לבטל הזמנה במצב הנוכחי');
   const claimed=await tx.order.updateMany({where:{id,userId,status:OrderStatus.PENDING_PAYMENT},data:{status:OrderStatus.CANCELLED}});if(claimed.count!==1)throw new ConflictException('מצב ההזמנה כבר השתנה');
   await tx.sellerOrder.updateMany({where:{orderId:id},data:{status:OrderStatus.CANCELLED}});
   for(const item of order.sellerOrders.flatMap(group=>group.items)){const variant=await tx.productVariant.findUnique({where:{sku:item.sku},select:{id:true}});if(variant)await tx.inventory.updateMany({where:{variantId:variant.id},data:{quantity:{increment:item.quantity},version:{increment:1}}})}
   await tx.auditLog.create({data:{actorId:userId,action:'CUSTOMER_ORDER_CANCELLED',entityType:'Order',entityId:id,metadata:{previousStatus:order.status,newStatus:OrderStatus.CANCELLED}}});
   return this.customerOrderFromClient(tx,userId,id);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private async customerOrderFromClient(client:Prisma.TransactionClient,userId:string,id:string){const order=await client.order.findFirst({where:{id,userId},select:orderDetailSelect});if(!order)throw new NotFoundException();return order}
 async sellerOrder(userId:string,id:string){const seller=await this.db.sellerProfile.findUnique({where:{userId},select:{id:true,status:true}});if(!seller||seller.status!=='APPROVED')throw new NotFoundException('הזמנת המוכר לא נמצאה');const order=await this.db.sellerOrder.findFirst({where:{id,sellerId:seller.id},select:{id:true,status:true,subtotalAgorot:true,shippingAgorot:true,commissionAgorot:true,netAgorot:true,order:{select:{orderNumber:true,createdAt:true,status:true,shippingAddress:true,payment:{select:{status:true}}}},items:{select:{id:true,productName:true,sku:true,variantName:true,quantity:true,unitPriceAgorot:true,discountAgorot:true}}}});if(!order)throw new NotFoundException('הזמנת המוכר לא נמצאה');return order}
 async updateSellerStatus(userId:string,id:string,status:OrderStatus){
  return this.db.$transaction(async tx=>{const seller=await tx.sellerProfile.findUnique({where:{userId},select:{id:true,status:true}});if(!seller||seller.status!=='APPROVED')throw new NotFoundException('הזמנת המוכר לא נמצאה');const current=await tx.sellerOrder.findFirst({where:{id,sellerId:seller.id},select:{id:true,status:true,orderId:true,order:{select:{status:true,payment:{select:{status:true}}}}}});if(!current)throw new NotFoundException('הזמנת המוכר לא נמצאה');if(current.order.payment?.status!==PaymentStatus.CAPTURED||current.order.status===OrderStatus.PENDING_PAYMENT)throw new ConflictException('לא ניתן לקדם הזמנה לפני אישור התשלום');if(!canSellerTransition(current.status,status))throw new BadRequestException('מעבר סטטוס אינו מותר');const updated=await tx.sellerOrder.update({where:{id},data:{status},select:{id:true,status:true}});const groups=await tx.sellerOrder.findMany({where:{orderId:current.orderId},select:{status:true}});const aggregate=aggregateOrderStatus(groups.map(group=>group.status));await tx.order.update({where:{id:current.orderId},data:{status:aggregate}});await tx.auditLog.create({data:{actorId:userId,action:'SELLER_ORDER_STATUS_CHANGED',entityType:'SellerOrder',entityId:id,metadata:{previousStatus:current.status,newStatus:status,orderId:current.orderId}}});return updated},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
}

@UseGuards(JwtAuthGuard)@Controller('orders')
export class CustomerOrderManagementController{constructor(private readonly orders:OrdersService){}@Get(':id')one(@CurrentUser()user:AuthUser,@Param('id',new ParseUUIDPipe())id:string){return this.orders.customerOrder(user.sub,id)}@Patch(':id/cancel')cancel(@CurrentUser()user:AuthUser,@Param('id',new ParseUUIDPipe())id:string){return this.orders.cancelCustomerOrder(user.sub,id)}}

@Controller('seller/orders')
export class SellerOrderManagementController{constructor(private readonly orders:OrdersService){}@RequireRoles(Role.SELLER,Role.ADMIN,Role.SUPER_ADMIN)@Get(':id')one(@CurrentUser()user:AuthUser,@Param('id',new ParseUUIDPipe())id:string){return this.orders.sellerOrder(user.sub,id)}@RequireRoles(Role.SELLER,Role.ADMIN,Role.SUPER_ADMIN)@Patch(':id/status')status(@CurrentUser()user:AuthUser,@Param('id',new ParseUUIDPipe())id:string,@Body()dto:SellerOrderStatusDto){return this.orders.updateSellerStatus(user.sub,id,dto.status)}}

@Controller('admin')
export class AdminOrdersManagementController{
 constructor(private readonly db:PrismaService){}
 @RequireRoles(Role.ADMIN,Role.SUPER_ADMIN)@Get('order-sellers')sellers(){return this.db.sellerProfile.findMany({where:{sellerOrders:{some:{}}},orderBy:{businessName:'asc'},select:{id:true,businessName:true,store:{select:{name:true}}}})}
 @RequireRoles(Role.ADMIN,Role.SUPER_ADMIN)@Get('orders-managed')async list(@Query()query:AdminOrdersQueryDto){const search=query.search?.trim();const where:Prisma.OrderWhereInput={...(search?{OR:[{orderNumber:{contains:search,mode:'insensitive'}},{user:{email:{contains:search,mode:'insensitive'}}},{user:{firstName:{contains:search,mode:'insensitive'}}},{user:{lastName:{contains:search,mode:'insensitive'}}}]}:{}),...(query.status?{status:query.status}:{}),...(query.paymentStatus?{payment:{is:{status:query.paymentStatus}}}:{}),...(query.sellerId?{sellerOrders:{some:{sellerId:query.sellerId}}}:{})};const[data,total]=await this.db.$transaction([this.db.order.findMany({where,skip:(query.page-1)*query.limit,take:query.limit,orderBy:{createdAt:'desc'},select:{id:true,orderNumber:true,status:true,totalAgorot:true,createdAt:true,user:{select:{firstName:true,lastName:true,email:true}},payment:{select:{status:true}},sellerOrders:{select:{status:true,seller:{select:{id:true,businessName:true,store:{select:{name:true}}}}}},_count:{select:{sellerOrders:true}}}}),this.db.order.count({where})]);return{data,pagination:{page:query.page,limit:query.limit,total,pages:Math.ceil(total/query.limit)}}}
 @RequireRoles(Role.ADMIN,Role.SUPER_ADMIN)@Get('orders-managed/:id')async detail(@Param('id',new ParseUUIDPipe())id:string){const order=await this.db.order.findUnique({where:{id},select:{id:true,orderNumber:true,status:true,totalAgorot:true,shippingAddress:true,createdAt:true,user:{select:{firstName:true,lastName:true,email:true,phone:true}},payment:{select:{status:true,amountAgorot:true,provider:true}},sellerOrders:{select:{id:true,status:true,subtotalAgorot:true,shippingAgorot:true,commissionAgorot:true,netAgorot:true,seller:{select:{id:true,businessName:true,store:{select:{name:true}}}},items:{select:{id:true,productName:true,sku:true,variantName:true,quantity:true,unitPriceAgorot:true,discountAgorot:true,product:{select:{images:{orderBy:{position:'asc'},take:1,select:{storageUrl:true,altText:true}}}}}}}}}});if(!order)throw new NotFoundException('ההזמנה לא נמצאה');return order}
}
