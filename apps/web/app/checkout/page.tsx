"use client";
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Address,AddressManager} from '../../components/address-manager';
import {useCart} from '../../components/cart-context';
import {Footer,Header} from '../../components/site-shell';
import {api} from '../../lib/api';
type Quote={subtotalAgorot:number;shippingAgorot:number;commissionAgorot:number;totalAgorot:number;sellerOrders:{sellerId:string;subtotalAgorot:number}[]};
type CreatedOrder={id:string;orderNumber:string;totalAgorot:number};
const money=(value:number)=>new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS'}).format(value/100);
export default function CheckoutPage(){
 const router=useRouter(),cart=useCart(),submittingRef=useRef(false),idempotencyRef=useRef<string|null>(null);
 const[quote,setQuote]=useState<Quote|null>(null),[quoting,setQuoting]=useState(false),[submitting,setSubmitting]=useState(false),[error,setError]=useState(''),[hasToken,setHasToken]=useState(false),[selectedAddress,setSelectedAddress]=useState<Address|null>(null);
 const payload=useMemo(()=>({items:cart.items.map(x=>({productId:x.productId,variantId:x.variantId,quantity:x.quantity}))}),[cart.items]);
 const loadQuote=useCallback(()=>{if(!cart.ready||!payload.items.length)return;setQuoting(true);setError('');api.post<Quote>('/checkout/quote',payload).then(setQuote).catch((cause:Error)=>{setQuote(null);setError(cause.message)}).finally(()=>setQuoting(false))},[cart.ready,payload]);
 useEffect(()=>{setHasToken(Boolean(localStorage.getItem('shuk-token')));loadQuote()},[loadQuote]);
 const addressesChanged=useCallback((addresses:Address[])=>setSelectedAddress(current=>addresses.find(x=>x.id===current?.id)??addresses.find(x=>x.isDefault)??addresses[0]??null),[]);
 useEffect(()=>{idempotencyRef.current=null},[payload,selectedAddress?.id]);
 async function continueToPayment(){
  if(submittingRef.current||!quote||!selectedAddress)return;
  const token=localStorage.getItem('shuk-token');if(!token){setHasToken(false);setError('יש להתחבר לפני ביצוע ההזמנה');return}
  submittingRef.current=true;setSubmitting(true);setError('');
  try{const key=idempotencyRef.current??crypto.randomUUID();idempotencyRef.current=key;const order=await api.post<CreatedOrder>('/checkout/orders',{...payload,addressId:selectedAddress.id},token,{'Idempotency-Key':key});idempotencyRef.current=null;cart.clear();router.push(`/payment?orderId=${encodeURIComponent(order.id)}`)}
  catch(cause){setError((cause as Error).message);loadQuote()}
  finally{submittingRef.current=false;setSubmitting(false)}
 }
 return <main dir="rtl"><Header/><section className="wrap checkoutPage">{!cart.ready?<div className="customerLoading"><span/><p>טוענים את הסל…</p></div>:!cart.items.length?<div className="customerEmpty"><span>🛒</span><h1>אין מוצרים לתשלום</h1><p>הוסיפו מוצרים לסל לפני המעבר לקופה.</p><Link className="primary" href="/">חזרה לחנות</Link></div>:<><div className="checkoutHeader"><label>סקירת ההזמנה</label><h1>סיכום וכתובת משלוח</h1><p>המחירים והמלאי נבדקים בשרת. לאחר אישור הסיכום תיווצר הזמנה במצב המתנה לתשלום.</p></div>{hasToken?<AddressManager selectable selectedId={selectedAddress?.id} onSelect={setSelectedAddress} onAddressesChange={addressesChanged}/>:<div className="checkoutError">יש <Link href="/login">להתחבר לחשבון</Link> כדי לבחור כתובת ולהמשיך.</div>}<div className="checkoutLayout"><section className="checkoutProducts"><h2>המוצרים בהזמנה</h2>{cart.items.map(item=><article key={item.variantId}>{item.image?<img src={item.image} alt={item.name}/>:<span>📦</span>}<div><b>{item.name}</b><small>{item.sellerName}</small><small>כמות: {item.quantity}</small></div><strong>{money(item.priceAgorot*item.quantity)}</strong></article>)}</section><aside className="cartSummary sticky"><h2>סיכום הזמנה</h2>{quoting?<div className="inlineLoading">מעדכנים מחיר ומלאי…</div>:quote&&<><p>מוצרים <b>{money(quote.subtotalAgorot)}</b></p><p>משלוח <b>{quote.shippingAgorot?money(quote.shippingAgorot):'חינם'}</b></p><hr/><p className="cartTotal">סה״כ <b>{money(quote.totalAgorot)}</b></p></>}{selectedAddress?<div className="selectedAddress"><b>משלוח אל</b><span>{selectedAddress.fullName}</span><span>{selectedAddress.street} {selectedAddress.building}, {selectedAddress.city}</span></div>:hasToken&&<div className="checkoutError">יש להוסיף ולבחור כתובת משלוח.</div>}{error&&<div className="checkoutError">{error}</div>}<button className="primary checkoutButton" disabled={!quote||quoting||submitting||!hasToken||!selectedAddress} onClick={()=>void continueToPayment()}>{submitting?'יוצרים הזמנה מאובטחת…':'המשך לתשלום'}</button><small>הסכום הסופי מגיע מהשרת. בשלב הבא לא יתבצע חיוב כל עוד ספק התשלום אינו מחובר.</small></aside></div></>}</section><Footer/></main>
}
