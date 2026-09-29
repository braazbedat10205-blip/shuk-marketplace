"use client";
import {createContext,useContext,useEffect,useMemo,useState,type ReactNode} from "react";
import type {Product} from "../lib/types";

const STORAGE_KEY="shuk-wishlist";
type WishlistValue={items:Product[];has:(id:string)=>boolean;toggle:(product:Product)=>void};
const WishlistContext=createContext<WishlistValue|null>(null);
export function WishlistProvider({children}:{children:ReactNode}){const[items,setItems]=useState<Product[]>([]);useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)??"[]");if(Array.isArray(saved))setItems(saved)}catch{localStorage.removeItem(STORAGE_KEY)}},[]);const value=useMemo<WishlistValue>(()=>({items,has:id=>items.some(item=>item.id===id),toggle:product=>setItems(current=>{const next=current.some(item=>item.id===product.id)?current.filter(item=>item.id!==product.id):[product,...current];localStorage.setItem(STORAGE_KEY,JSON.stringify(next));return next})}),[items]);return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>}
export function useWishlist(){const value=useContext(WishlistContext);if(!value)throw new Error("WishlistProvider missing");return value}
