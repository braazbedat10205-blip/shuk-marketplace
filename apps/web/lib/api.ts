import { Category, Product } from './types';
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
export class ApiError extends Error { constructor(public readonly status: number, message: string) { super(message); this.name = 'ApiError'; } }
type RefreshedSession={accessToken:string};
let refreshFlight:Promise<string|null>|null=null;
async function refreshAccessToken(){
  if(!refreshFlight)refreshFlight=request<RefreshedSession>('/auth/refresh',{method:'POST'},true).then(session=>{localStorage.setItem('shuk-token',session.accessToken);window.dispatchEvent(new Event('shuk-auth-change'));return session.accessToken;}).catch(()=>null).finally(()=>{refreshFlight=null});
  return refreshFlight;
}
async function request<T>(path: string, init?: RequestInit, retried=false): Promise<T> {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);let response:Response;
  try{response=await fetch(`${API_URL}${path}`, { ...init,signal:init?.signal??controller.signal,credentials:'include', headers: { ...(init?.body instanceof FormData?{}:{'Content-Type':'application/json'}), ...init?.headers } });}
  catch(error){if(error instanceof DOMException&&error.name==='AbortError')throw new ApiError(408,'הבקשה ארכה זמן רב מדי. בדקו את החיבור ונסו שוב.');throw new ApiError(0,'לא ניתן להתחבר לשרת. בדקו את החיבור לאינטרנט ונסו שוב.');}
  finally{clearTimeout(timeout)}
  if(response.status===401&&!retried&&path!=='/auth/refresh'&&typeof window!=='undefined'&&new Headers(init?.headers).has('Authorization')){
    const token=await refreshAccessToken();if(token){const headers=new Headers(init?.headers);headers.set('Authorization',`Bearer ${token}`);return request<T>(path,{...init,headers},true);}localStorage.removeItem('shuk-token');window.dispatchEvent(new Event('shuk-auth-change'));
  }
  if (!response.ok) { const body = await response.json().catch(() => null) as { message?: string | string[] } | null; const detail = Array.isArray(body?.message) ? body.message[0] : body?.message; const fallback=response.status===401?'פג תוקף ההתחברות. התחברו מחדש.':response.status===403?'אין הרשאה לבצע פעולה זו.':response.status===404?'הפריט המבוקש לא נמצא.':response.status===409?'המידע השתנה. רעננו ונסו שוב.':response.status===429?'בוצעו יותר מדי ניסיונות. נסו שוב מאוחר יותר.':'אירעה שגיאה בשרת. נסו שוב.';throw new ApiError(response.status, detail ?? fallback); }
  return response.json() as Promise<T>;
}
export const mediaUrl=(value?:string|null)=>value?.startsWith('/uploads/')?`${API_URL.replace(/\/api\/?$/,'')}${value}`:(value??'');
export const api = {
  products: (params = '') => request<{ data: Product[]; pagination: { page: number; pages: number; total: number } }>(`/products${params ? `?${params}` : ''}`),
  product: (slug: string) => request<Product & { reviewCount: number; related: Product[]; moreFromStore: Product[] }>(`/products/${encodeURIComponent(slug)}`),
  categories: () => request<Category[]>('/categories'), store: (slug: string) => request<{ slug: string; name: string; description: string | null; city: string | null; seller: { rating: string } }>(`/stores/${encodeURIComponent(slug)}`),
  post: <T>(path: string, body: unknown, token?: string, headers?:Record<string,string>) => request<T>(path, { method: 'POST', body: JSON.stringify(body), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),...headers } }),
  patch: <T>(path: string, body: unknown, token: string) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body), headers: { Authorization: `Bearer ${token}` } }),
  delete: <T>(path: string, token: string) => request<T>(path, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }),
  upload: <T>(path:string,body:FormData,token:string)=>request<T>(path,{method:'POST',body,headers:{Authorization:`Bearer ${token}`}}),
  authGet: <T>(path: string, token: string) => request<T>(path, { headers: { Authorization: `Bearer ${token}` } }),
  logout:()=>request<{message:string}>('/auth/logout',{method:'POST'}),
};
