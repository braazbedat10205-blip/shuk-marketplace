"use client";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { CartItem } from '../lib/types';
type CartValue = { items: CartItem[]; count: number; total: number; ready: boolean; add: (item: CartItem) => void; sync: (variantId: string, values: Partial<CartItem>) => void; setQuantity: (variantId: string, quantity: number) => void; remove: (variantId: string) => void; clear: () => void };
const CartContext = createContext<CartValue | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]); const [ready, setReady] = useState(false);
  useEffect(() => { try { setItems(JSON.parse(localStorage.getItem('shuk-cart') ?? '[]') as CartItem[]); } finally { setReady(true); } }, []);
  useEffect(() => { if (ready) localStorage.setItem('shuk-cart', JSON.stringify(items)); }, [items, ready]);
  const value = useMemo<CartValue>(() => ({ items, ready, count: items.reduce((n, x) => n + x.quantity, 0), total: items.reduce((n, x) => n + x.priceAgorot * x.quantity, 0), add: (item) => setItems((current) => { const found = current.find((x) => x.variantId === item.variantId); if (!found) return [...current, { ...item, quantity: Math.min(item.quantity, item.availableQuantity) }]; return current.map((x) => x.variantId === item.variantId ? { ...x, quantity: Math.min(x.quantity + item.quantity, item.availableQuantity), availableQuantity: item.availableQuantity, priceAgorot: item.priceAgorot } : x); }), sync: (id, values) => setItems((current) => current.map((x) => x.variantId === id ? { ...x, ...values, quantity: Math.min(x.quantity, values.availableQuantity ?? x.availableQuantity) } : x)), setQuantity: (id, quantity) => setItems((current) => current.map((x) => x.variantId === id ? { ...x, quantity: Math.max(1, Math.min(quantity, x.availableQuantity)) } : x)), remove: (id) => setItems((current) => current.filter((x) => x.variantId !== id)), clear: () => setItems([]) }), [items, ready]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() { const value = useContext(CartContext); if (!value) throw new Error('CartProvider missing'); return value; }
