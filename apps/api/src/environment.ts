import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../../.env') });

export function validateEnvironment() {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) missing.push('JWT_SECRET (at least 32 characters)');
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.WEB_ORIGIN) missing.push('WEB_ORIGIN');
    if (!process.env.APP_URL) missing.push('APP_URL');
    if (process.env.WEB_ORIGIN?.split(',').some(value => value.trim() === '*')) missing.push('WEB_ORIGIN must not contain *');
    for (const [name,value] of [['WEB_ORIGIN',process.env.WEB_ORIGIN],['APP_URL',process.env.APP_URL]] as const) {
      if(value)try{const url=new URL(value.split(',')[0].trim());if(url.protocol!=='https:')missing.push(`${name} must use HTTPS in production`);}catch{missing.push(`${name} must be a valid URL`);}
    }
  }
  if (missing.length) throw new Error(`Missing or invalid required configuration: ${missing.join(', ')}`);
}
