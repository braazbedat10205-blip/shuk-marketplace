import type {MetadataRoute} from 'next';
import {API_URL} from '../lib/api';

type SitemapData={categories:{slug:string}[];stores:{slug:string}[];products:{slug:string;updatedAt:string}[]};

export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const base=(process.env.NEXT_PUBLIC_SITE_URL??'http://localhost:3000').replace(/\/$/,'');
 const entries:MetadataRoute.Sitemap=[{url:base,changeFrequency:'daily',priority:1}];
 try{
  const response=await fetch(`${API_URL}/discovery/sitemap`,{next:{revalidate:3600}});
  if(!response.ok)return entries;
  const data=await response.json() as SitemapData;
  entries.push(...data.categories.map(x=>({url:`${base}/?category=${encodeURIComponent(x.slug)}`,changeFrequency:'weekly' as const,priority:.7})));
  entries.push(...data.stores.map(x=>({url:`${base}/seller/${encodeURIComponent(x.slug)}`,changeFrequency:'weekly' as const,priority:.7})));
  entries.push(...data.products.map(x=>({url:`${base}/product/${encodeURIComponent(x.slug)}`,lastModified:new Date(x.updatedAt),changeFrequency:'weekly' as const,priority:.8})));
 }catch{/* Keep a valid minimal sitemap if the API is temporarily unavailable. */}
 return entries;
}
