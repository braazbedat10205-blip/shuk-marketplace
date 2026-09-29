export type CommissionScope = { productBps?: number | null; sellerBps?: number | null; categoryBps?: number | null; globalBps: number };
export function resolveCommissionBps(x: CommissionScope) { return x.productBps ?? x.sellerBps ?? x.categoryBps ?? x.globalBps; }
export function calculateCommission(amountAgorot: number, bps: number) {
  if (!Number.isSafeInteger(amountAgorot) || amountAgorot < 0) throw new Error('Invalid amount');
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new Error('Invalid rate');
  return Math.round((amountAgorot * bps) / 10_000);
}
