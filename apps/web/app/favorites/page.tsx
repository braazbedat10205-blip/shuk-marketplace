"use client";
import Link from "next/link";
import {Footer,Header} from "../../components/site-shell";
import {ProductCard} from "../../components/product-card";
import {useWishlist} from "../../components/wishlist-context";
export default function FavoritesPage(){const{items}=useWishlist();return <main><Header/><section className="products wrap favoritesPage"><div className="sectionHead"><div><label>החשבון שלי</label><h1>המועדפים שלי</h1><p>מוצרים ששמרתם כדי לחזור אליהם מאוחר יותר.</p></div></div>{items.length?<div className="grid">{items.map(product=><ProductCard key={product.id} product={product}/>)}</div>:<div className="customerEmpty"><span>♡</span><h2>עדיין אין מוצרים מועדפים</h2><p>לחצו על הלב בכרטיס מוצר כדי לשמור אותו כאן.</p><Link className="primary" href="/#products">לכל המוצרים</Link></div>}</section><Footer/></main>}
