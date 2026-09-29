import type {Metadata} from "next";
import "./globals.css";
import "./ux-fixes.css";
import "./brand-redesign.css";
import {CartProvider} from "../components/cart-context";
import {ModalAccessibility} from "../components/modal-accessibility";
import {WishlistProvider} from "../components/wishlist-context";
import {LanguageProvider} from "../components/language-context";
export const dynamic="force-dynamic";
export const metadata:Metadata={metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL??"http://localhost:3000"),title:{default:"שוק | קונים מקומי מכל הארץ",template:"%s | שוק"},description:"חנויות ומוצרים אמינים מכל ישראל במקום אחד",openGraph:{siteName:"שוק",locale:"he_IL",type:"website"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="he" dir="rtl"><body><LanguageProvider><CartProvider><WishlistProvider><ModalAccessibility/>{children}</WishlistProvider></CartProvider></LanguageProvider></body></html>}
