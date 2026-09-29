import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

export interface RateLimitStore { consume(key:string,limit:number,windowMs:number):Promise<void> }
export const RATE_LIMIT_STORE=Symbol('RATE_LIMIT_STORE');

@Injectable()
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly attempts = new Map<string, number[]>();
  async consume(key: string, limit: number, windowMs: number) {
    const now = Date.now(); const active = (this.attempts.get(key) ?? []).filter((time) => time > now - windowMs);
    if (active.length >= limit) throw new HttpException('יותר מדי ניסיונות. נסו שוב מאוחר יותר.', HttpStatus.TOO_MANY_REQUESTS);
    active.push(now); this.attempts.set(key, active);
  }
}

@Injectable()
export class RateLimitService {
  constructor(@Inject(RATE_LIMIT_STORE) private readonly store:RateLimitStore){}
  consume(key:string,limit:number,windowMs:number){return this.store.consume(key,limit,windowMs)}
}
