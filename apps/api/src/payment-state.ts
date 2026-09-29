import {OrderStatus,PaymentStatus} from '@prisma/client';
export type PaymentPageState='PENDING_PAYMENT'|'PROCESSING'|'PAID'|'FAILED'|'CANCELLED'|'UNAVAILABLE';
export function resolvePaymentPageState(orderStatus:OrderStatus,paymentStatus?:PaymentStatus|null):PaymentPageState {
  if(orderStatus===OrderStatus.PAID||paymentStatus===PaymentStatus.CAPTURED)return 'PAID';
  if(paymentStatus===PaymentStatus.FAILED)return 'FAILED';
  if(paymentStatus===PaymentStatus.PENDING||paymentStatus===PaymentStatus.AUTHORIZED)return 'PROCESSING';
  if(orderStatus===OrderStatus.CANCELLED||orderStatus===OrderStatus.REFUNDED)return 'CANCELLED';
  if(orderStatus!==OrderStatus.PENDING_PAYMENT)return 'UNAVAILABLE';
  return 'PENDING_PAYMENT';
}
