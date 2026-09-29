import {OrderStatus} from '@prisma/client';
import {PaymentStatus} from '@prisma/client';
const sellerTransitions:Partial<Record<OrderStatus,OrderStatus[]>>={
  [OrderStatus.PAID]:[OrderStatus.PROCESSING],
  [OrderStatus.PROCESSING]:[OrderStatus.READY_TO_SHIP],
  [OrderStatus.READY_TO_SHIP]:[OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]:[OrderStatus.IN_TRANSIT,OrderStatus.DELIVERED],
  [OrderStatus.IN_TRANSIT]:[OrderStatus.DELIVERED],
};
export function canSellerTransition(from:OrderStatus,to:OrderStatus){return sellerTransitions[from]?.includes(to)??false}
export function canCustomerCancel(status:OrderStatus,paymentStatus?:PaymentStatus|null){return status===OrderStatus.PENDING_PAYMENT&&(!paymentStatus||paymentStatus===PaymentStatus.FAILED)}
export function aggregateOrderStatus(statuses:OrderStatus[]):OrderStatus {
  const rank:Partial<Record<OrderStatus,number>>={PAID:0,PROCESSING:1,READY_TO_SHIP:2,SHIPPED:3,IN_TRANSIT:4,DELIVERED:5};
  const minimum=Math.min(...statuses.map(status=>rank[status]??0));
  return ([OrderStatus.PAID,OrderStatus.PROCESSING,OrderStatus.READY_TO_SHIP,OrderStatus.SHIPPED,OrderStatus.IN_TRANSIT,OrderStatus.DELIVERED] as OrderStatus[])[minimum];
}
