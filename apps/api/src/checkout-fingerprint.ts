import { createHash } from 'crypto';

export function checkoutRequestFingerprint(dto:{addressId:string;items:{productId:string;variantId:string;quantity:number}[]}){
  const items=[...dto.items].map(({productId,variantId,quantity})=>({productId,variantId,quantity})).sort((a,b)=>`${a.productId}:${a.variantId}`.localeCompare(`${b.productId}:${b.variantId}`));
  return createHash('sha256').update(JSON.stringify({addressId:dto.addressId,items})).digest('hex');
}
