import { MemoryRateLimitStore,RateLimitService } from './rate-limit';
import { checkoutRequestFingerprint } from './checkout-fingerprint';
import { detectImage } from './image-validation';
import { digestSessionToken,isSessionUsable,newRefreshToken } from './session-security';

describe('production hardening',()=>{
  const base={addressId:'00000000-0000-4000-8000-000000000001',items:[{productId:'00000000-0000-4000-8000-000000000002',variantId:'00000000-0000-4000-8000-000000000003',quantity:1}]};
  it('uses the same checkout fingerprint regardless of item order',()=>{const second={...base,items:[...base.items,{productId:'00000000-0000-4000-8000-000000000004',variantId:'00000000-0000-4000-8000-000000000005',quantity:2}]};expect(checkoutRequestFingerprint(second)).toBe(checkoutRequestFingerprint({...second,items:[...second.items].reverse()}));});
  it('changes checkout fingerprint for quantity or address tampering',()=>{expect(checkoutRequestFingerprint(base)).not.toBe(checkoutRequestFingerprint({...base,items:[{...base.items[0],quantity:2}]}));expect(checkoutRequestFingerprint(base)).not.toBe(checkoutRequestFingerprint({...base,addressId:'00000000-0000-4000-8000-000000000099'}));});
  it('does not include client totals in the checkout fingerprint',()=>{expect(checkoutRequestFingerprint(base)).toBe(checkoutRequestFingerprint({...base,totalAgorot:1} as typeof base));});
  it('returns 429 after the limit and recovers after its window',async()=>{const clock=jest.spyOn(Date,'now').mockReturnValue(1000),limiter=new RateLimitService(new MemoryRateLimitStore());await limiter.consume('login:ip',2,1000);await limiter.consume('login:ip',2,1000);await expect(limiter.consume('login:ip',2,1000)).rejects.toMatchObject({status:429});clock.mockReturnValue(2001);await expect(limiter.consume('login:ip',2,1000)).resolves.toBeUndefined();clock.mockRestore();});
  it('delegates rate limits through a replaceable store abstraction',async()=>{const store={consume:jest.fn().mockResolvedValue(undefined)},limiter=new RateLimitService(store);await limiter.consume('admin:user',10,1000);expect(store.consume).toHaveBeenCalledWith('admin:user',10,1000);});
  it('rejects SVG, HTML renamed as PNG, and executable bytes',()=>{expect(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();expect(detectImage(Buffer.from('<html>not png</html>'))).toBeNull();expect(detectImage(Buffer.from('MZ executable'))).toBeNull();});
  it('stores only a one-way refresh-token digest',()=>{const token=newRefreshToken();expect(token.length).toBeGreaterThan(32);expect(digestSessionToken(token)).not.toContain(token);expect(digestSessionToken(token)).toHaveLength(64);});
  it('rejects expired and revoked sessions',()=>{const now=new Date();expect(isSessionUsable({revokedAt:null,expiresAt:new Date(now.getTime()+1000)},now)).toBe(true);expect(isSessionUsable({revokedAt:now,expiresAt:new Date(now.getTime()+1000)},now)).toBe(false);expect(isSessionUsable({revokedAt:null,expiresAt:new Date(now.getTime()-1)},now)).toBe(false);});
});
