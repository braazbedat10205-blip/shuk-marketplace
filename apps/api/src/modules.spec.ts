import { calculateCommission, resolveCommissionBps } from './money';
import { calculateShippingAgorot } from './shipping';
import { detectImage } from './image-validation';
import {OrderStatus,PaymentStatus} from '@prisma/client';
import {resolvePaymentPageState} from './payment-state';
import {aggregateOrderStatus,canCustomerCancel,canSellerTransition} from './order-workflow';
describe('money and commission', () => {
  it('calculates 10% without floating money', () => expect(calculateCommission(30000, 1000)).toBe(3000));
  it('rounds fractional agorot deterministically', () => expect(calculateCommission(999, 825)).toBe(82));
  it('uses most specific commission', () => expect(resolveCommissionBps({productBps:700,sellerBps:800,categoryBps:900,globalBps:1000})).toBe(700));
  it('rejects unsafe amounts', () => expect(() => calculateCommission(Number.MAX_VALUE, 1000)).toThrow());
  it('uses the backend shipping source of truth for MVP orders', () => expect(calculateShippingAgorot()).toBe(0));
  it('detects image content by signature',()=>expect(detectImage(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))?.mime).toBe('image/png'));
  it('rejects content that only claims to be an image',()=>expect(detectImage(Buffer.from('not an image'))).toBeNull());
});
describe('order workflow',()=>{
  it('allows only forward seller fulfillment transitions',()=>{expect(canSellerTransition(OrderStatus.PAID,OrderStatus.PROCESSING)).toBe(true);expect(canSellerTransition(OrderStatus.PROCESSING,OrderStatus.SHIPPED)).toBe(false);expect(canSellerTransition(OrderStatus.SHIPPED,OrderStatus.DELIVERED)).toBe(true)});
  it('never allows a seller to mark pending payment as paid',()=>expect(canSellerTransition(OrderStatus.PENDING_PAYMENT,OrderStatus.PAID)).toBe(false));
  it('keeps a multi-seller order at the least advanced fulfillment state',()=>expect(aggregateOrderStatus([OrderStatus.SHIPPED,OrderStatus.PROCESSING])).toBe(OrderStatus.PROCESSING));
  it('allows cancellation only before payment confirmation',()=>{expect(canCustomerCancel(OrderStatus.PENDING_PAYMENT,null)).toBe(true);expect(canCustomerCancel(OrderStatus.PENDING_PAYMENT,PaymentStatus.FAILED)).toBe(true);expect(canCustomerCancel(OrderStatus.PAID,PaymentStatus.CAPTURED)).toBe(false)});
});
describe('payment page state',()=>{
  it('allows only pending orders to remain payable',()=>expect(resolvePaymentPageState(OrderStatus.PENDING_PAYMENT,null)).toBe('PENDING_PAYMENT'));
  it('never offers a captured order for payment again',()=>expect(resolvePaymentPageState(OrderStatus.PENDING_PAYMENT,PaymentStatus.CAPTURED)).toBe('PAID'));
  it('reports failed provider attempts without claiming success',()=>expect(resolvePaymentPageState(OrderStatus.PENDING_PAYMENT,PaymentStatus.FAILED)).toBe('FAILED'));
  it('does not start a second attempt while a payment exists',()=>{expect(resolvePaymentPageState(OrderStatus.PENDING_PAYMENT,PaymentStatus.PENDING)).toBe('PROCESSING');expect(resolvePaymentPageState(OrderStatus.PENDING_PAYMENT,PaymentStatus.AUTHORIZED)).toBe('PROCESSING')});
  it('rejects cancelled and processing orders',()=>{expect(resolvePaymentPageState(OrderStatus.CANCELLED,null)).toBe('CANCELLED');expect(resolvePaymentPageState(OrderStatus.PROCESSING,null)).toBe('UNAVAILABLE')});
});
