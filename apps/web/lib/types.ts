export type Product = {
  id: string; slug: string; sku: string; nameHe: string; descriptionHe: string; priceAgorot: number; compareAtAgorot: number | null;
  supportsFastDelivery: boolean; availableQuantity: number; rating: number;
  images: { id: string; storageUrl: string; altText: string | null; position: number }[];
  category: { slug: string; nameHe: string };
  seller: { store: { slug: string; name: string; city: string | null; logoUrl: string | null } | null };
  variants: { id: string; sku: string; name: string; priceAgorot: number | null; inventory: { quantity: number; reserved: number } | null }[];
};
export type Category = { id: string; slug: string; nameHe: string; children: { id: string; slug: string; nameHe: string }[] };
export type CartItem = { productId: string; variantId: string; slug: string; name: string; priceAgorot: number; quantity: number; availableQuantity: number; sellerName: string; image?: string };
