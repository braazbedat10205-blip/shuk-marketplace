import { BadRequestException, Body, ConflictException, Controller, Get, Headers, Injectable, Post, UseGuards } from '@nestjs/common';
import { LedgerType, OrderStatus, Prisma, SellerStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser, JwtAuthGuard,RateLimitService } from './auth';
import { PrismaService } from './prisma';
import { calculateCommission, resolveCommissionBps } from './money';
import { calculateShippingAgorot } from './shipping';
import { checkoutRequestFingerprint } from './checkout-fingerprint';

export { calculateCommission, resolveCommissionBps } from './money';

class CheckoutItemDto {
  @IsUUID() productId!: string;
  @IsUUID() variantId!: string;
  @IsInt() @Min(1) @Max(99) quantity!: number;
}
export class CheckoutDto { @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => CheckoutItemDto) items!: CheckoutItemDto[]; }
class CheckoutOrderDto extends CheckoutDto { @IsUUID() addressId!:string; }

@Injectable()
export class CheckoutService {
  constructor(private readonly db: PrismaService) {}
  private async pricedItems(dto: CheckoutDto, client: Prisma.TransactionClient | PrismaService = this.db) {
    const uniqueIds = [...new Set(dto.items.map((x) => x.variantId))];
    const variants = await client.productVariant.findMany({ where: { id: { in: uniqueIds }, product: { status: 'ACTIVE', deletedAt: null,seller:{status:SellerStatus.APPROVED} } }, include: { inventory: true, product: { include: { seller: true, category: true } } } });
    const byId = new Map(variants.map((x) => [x.id, x]));
    return dto.items.map((item) => {
      const variant = byId.get(item.variantId);
      if (!variant || variant.productId !== item.productId) throw new BadRequestException('אחד המוצרים אינו זמין');
      const available = (variant.inventory?.quantity ?? 0) - (variant.inventory?.reserved ?? 0);
      if (available < item.quantity) throw new BadRequestException(`אין מספיק מלאי עבור ${variant.product.nameHe}`);
      const unitPriceAgorot = variant.priceAgorot ?? variant.product.priceAgorot;
      const subtotalAgorot = unitPriceAgorot * item.quantity;
      const commissionBps = resolveCommissionBps({ productBps: variant.product.commissionBps, sellerBps: variant.product.seller.commissionBps, categoryBps: variant.product.category.commissionBps, globalBps: 1000 });
      return { ...item, variant, unitPriceAgorot, subtotalAgorot, commissionAgorot: calculateCommission(subtotalAgorot, commissionBps) };
    });
  }
  async quote(dto: CheckoutDto) {
    const items = await this.pricedItems(dto);
    const groups = new Map<string, { sellerId: string; subtotalAgorot: number; shippingAgorot: number; commissionAgorot: number; netAgorot: number }>();
    for (const item of items) {
      const sellerId = item.variant.product.sellerId;
      const group = groups.get(sellerId) ?? { sellerId, subtotalAgorot: 0, shippingAgorot: 0, commissionAgorot: 0, netAgorot: 0 };
      group.subtotalAgorot += item.subtotalAgorot; group.commissionAgorot += item.commissionAgorot;
      group.netAgorot = group.subtotalAgorot - group.commissionAgorot; groups.set(sellerId, group);
    }
    const sellerOrders = [...groups.values()];
    const subtotalAgorot = sellerOrders.reduce((n, x) => n + x.subtotalAgorot, 0);
    const shippingAgorot = calculateShippingAgorot();
    return { currency: 'ILS', subtotalAgorot, shippingAgorot, commissionAgorot: sellerOrders.reduce((n, x) => n + x.commissionAgorot, 0), totalAgorot: subtotalAgorot + shippingAgorot, sellerOrders };
  }
  private fingerprint(dto:CheckoutOrderDto){
    return checkoutRequestFingerprint(dto);
  }
  private orderResult(client:Prisma.TransactionClient|PrismaService,id:string){return client.order.findUnique({where:{id},include:{sellerOrders:{include:{items:true}}}});}
  async create(userId: string, dto: CheckoutOrderDto, idempotencyKey:string) {
    if(!/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey))throw new BadRequestException('Invalid Idempotency-Key');
    const operation='CREATE_ORDER',requestHash=this.fingerprint(dto);
    try{return await this.db.$transaction(async (tx) => {
      await tx.idempotencyRecord.create({data:{userId,operation,key:idempotencyKey,requestHash}});
      const address=await tx.address.findFirst({where:{id:dto.addressId,userId}});if(!address)throw new BadRequestException('יש לבחור כתובת משלוח תקפה');
      const items = await this.pricedItems(dto, tx);
      for (const item of items) {
        const updated = await tx.inventory.updateMany({ where: { variantId: item.variantId, quantity: { gte: item.quantity } }, data: { quantity: { decrement: item.quantity }, version: { increment: 1 } } });
        if (updated.count !== 1) throw new BadRequestException(`המלאי השתנה עבור ${item.variant.product.nameHe}`);
      }
      const groups = new Map<string, typeof items>();
      for (const item of items) groups.set(item.variant.product.sellerId, [...(groups.get(item.variant.product.sellerId) ?? []), item]);
      const subtotalAgorot = items.reduce((n, x) => n + x.subtotalAgorot, 0);const shippingAgorot=calculateShippingAgorot();const totalAgorot=subtotalAgorot+shippingAgorot;const shippingAddress={fullName:address.fullName,phone:address.phone,city:address.city,street:address.street,houseNumber:address.building,apartment:address.apartment,postalCode:address.postalCode,notes:address.instructions};
      const order = await tx.order.create({ data: { orderNumber: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`, userId, status: OrderStatus.PENDING_PAYMENT, totalAgorot, shippingAddress, sellerOrders: { create: [...groups.entries()].map(([sellerId, sellerItems]) => { const subtotalAgorot = sellerItems.reduce((n, x) => n + x.subtotalAgorot, 0); const commissionAgorot = sellerItems.reduce((n, x) => n + x.commissionAgorot, 0); return { sellerId, subtotalAgorot, shippingAgorot:0, commissionAgorot, netAgorot: subtotalAgorot - commissionAgorot, items: { create: sellerItems.map((x) => ({ productId: x.productId, productName: x.variant.product.nameHe, sku: x.variant.sku, variantName: x.variant.name, quantity: x.quantity, unitPriceAgorot: x.unitPriceAgorot, commissionAgorot: x.commissionAgorot })) } }; }) } }, include: { sellerOrders: { include: { items: true } } } });
      await tx.ledgerEntry.create({ data: { orderId: order.id, type: LedgerType.MARKETPLACE_COMMISSION, amountAgorot: order.sellerOrders.reduce((n, x) => n + x.commissionAgorot, 0), referenceId: order.orderNumber, idempotencyKey: `commission:${order.id}` } });
      await tx.idempotencyRecord.update({where:{userId_operation_key:{userId,operation,key:idempotencyKey}},data:{status:'SUCCEEDED',orderId:order.id,completedAt:new Date()}});
      return order;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });}
    catch(error){
      if(error instanceof Prisma.PrismaClientKnownRequestError&&(error.code==='P2002'||error.code==='P2034')){
        const existing=await this.db.idempotencyRecord.findUnique({where:{userId_operation_key:{userId,operation,key:idempotencyKey}}});
        if(!existing&&error.code==='P2034')throw new ConflictException('Checkout contention detected; retry safely with the same Idempotency-Key');
        if(!existing)throw error;
        if(existing.requestHash!==requestHash)throw new ConflictException('Idempotency-Key was already used with a different request');
        if(existing.status==='SUCCEEDED'&&existing.orderId){const order=await this.orderResult(this.db,existing.orderId);if(order)return order;}
        throw new ConflictException('Checkout request is already processing');
      }
      throw error;
    }
  }
}

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService,private readonly rateLimit:RateLimitService) {}
  @Post('quote') quote(@Body() dto: CheckoutDto) { return this.checkout.quote(dto); }
  @UseGuards(JwtAuthGuard) @Post('orders') async create(@CurrentUser() user: AuthUser, @Body() dto: CheckoutOrderDto,@Headers('idempotency-key') key?:string) { await this.rateLimit.consume(`checkout:${user.sub}`,5,60*1000);if(!key)throw new BadRequestException('Idempotency-Key is required');return this.checkout.create(user.sub, dto,key); }
}

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class CustomerOrdersController {
  constructor(private readonly db: PrismaService) {}
  @Get('my') myOrders(@CurrentUser() user: AuthUser) {
    return this.db.order.findMany({
      where: { userId: user.sub }, orderBy: { createdAt: 'desc' },
      select: { id: true, orderNumber: true, status: true, currency: true, totalAgorot: true, shippingAddress:true, createdAt: true, payment: { select: { status: true } }, sellerOrders: { select: { id: true, status: true, subtotalAgorot: true, shippingAgorot: true, seller: { select: { store: { select: { name: true, slug: true } } } }, items: { select: { id: true, productName: true, sku: true, variantName: true, quantity: true, unitPriceAgorot: true, discountAgorot: true, product:{select:{images:{orderBy:{position:'asc'},take:1,select:{storageUrl:true,altText:true}}}} } } } } },
    });
  }
}
