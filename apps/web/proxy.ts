import { NextRequest,NextResponse } from 'next/server';

export function proxy(request:NextRequest){
  const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
  const apiOrigin=new URL(process.env.NEXT_PUBLIC_API_URL??'http://localhost:4000/api').origin;
  const scriptSrc=["'self'",`'nonce-${nonce}'`,...(process.env.NODE_ENV==='development'?["'unsafe-eval'"]:[])].join(' ');
  const connectSrc=["'self'",apiOrigin,...(process.env.NODE_ENV==='development'?['ws:','wss:']:[])].join(' ');
  const policy=["default-src 'self'",`script-src ${scriptSrc}`,`style-src 'self' 'nonce-${nonce}'`,"img-src 'self' data: blob: "+apiOrigin,"font-src 'self' data:",`connect-src ${connectSrc}`,"frame-ancestors 'none'","base-uri 'self'","form-action 'self'","object-src 'none'"].join('; ');
  const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',policy);
  const response=NextResponse.next({request:{headers}});response.headers.set('Content-Security-Policy',policy);if(/^\/(account|admin|seller-dashboard|become-seller|cart|checkout|payment|orders|login|forgot-password|reset-password)(\/|$)/.test(request.nextUrl.pathname))response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');return response;
}

export const config={matcher:[{source:'/((?!api|_next/static|_next/image|favicon.ico).*)',missing:[{type:'header',key:'next-router-prefetch'},{type:'header',key:'purpose',value:'prefetch'}]}]};
