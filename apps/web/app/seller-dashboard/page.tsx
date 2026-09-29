"use client";

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Footer, Header } from '../../components/site-shell';
import { api } from '../../lib/api';
import { Category } from '../../lib/types';
import { ManagedImage,ProductMediaManager } from '../../components/product-media-manager';
import {SellerOrdersWorkflow} from '../../components/seller-orders-workflow';

type Tab = 'overview' | 'products' | 'add' | 'orders';
type Stats = { orders: number; products: number; pendingOrders: number; salesAgorot: number; revenueAgorot: number };
type SellerProduct = { id: string; nameHe: string; descriptionHe: string; sku: string; status: string; priceAgorot: number; compareAtAgorot: number | null; supportsFastDelivery: boolean; categoryId: string; category: { nameHe: string }; images:ManagedImage[];variants: { id: string; sku: string; inventory: { quantity: number; reserved: number } | null }[] };
type ShippingAddress={fullName?:string;phone?:string;city?:string;street?:string;houseNumber?:string;apartment?:string;postalCode?:string;notes?:string};
type SellerOrder = { id: string; status: string; subtotalAgorot: number; commissionAgorot: number; netAgorot: number; shippingAgorot: number; order: { orderNumber: string; createdAt: string; status: string; shippingAddress?:ShippingAddress; payment: { status: string } | null }; items: { id: string; productName: string; variantName: string | null; quantity: number; unitPriceAgorot: number }[] };
type ProductForm = { nameHe: string; descriptionHe: string; sku: string; price: string; compareAt: string; quantity: string; categoryId: string; supportsFastDelivery: boolean };

const emptyForm: ProductForm = { nameHe: '', descriptionHe: '', sku: '', price: '', compareAt: '', quantity: '0', categoryId: '', supportsFastDelivery: false };
const money = (agorot: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(agorot / 100);
const statusLabel: Record<string, string> = { DRAFT: 'טיוטה', PENDING_APPROVAL: 'ממתין לאישור', ACTIVE: 'פעיל', REJECTED: 'נדחה', ARCHIVED: 'בארכיון', PENDING_PAYMENT: 'ממתין לתשלום', PAID: 'שולם', PROCESSING: 'בטיפול', READY_TO_SHIP: 'מוכן למשלוח', SHIPPED: 'נשלח', IN_TRANSIT: 'בדרך', DELIVERED: 'נמסר', CANCELLED: 'בוטל', REFUNDED: 'הוחזר' };

export default function SellerDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editing, setEditing] = useState<SellerProduct | null>(null);
  const [stockProduct, setStockProduct] = useState<SellerProduct | null>(null);
  const [stockValue, setStockValue] = useState('0');
  const [mediaProduct,setMediaProduct]=useState<SellerProduct|null>(null);

  const token = () => localStorage.getItem('shuk-token') ?? '';
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); setError('');
    const authToken = token();
    if (!authToken) { router.push('/login'); return; }
    try {
      const [nextStats, nextProducts, nextOrders, nextCategories] = await Promise.all([
        api.authGet<Stats>('/seller/dashboard', authToken), api.authGet<SellerProduct[]>('/seller/products', authToken),
        api.authGet<SellerOrder[]>('/seller/orders', authToken), api.categories(),
      ]);
      setStats(nextStats); setProducts(nextProducts); setOrders(nextOrders); setCategories(nextCategories);
      setForm((current) => ({ ...current, categoryId: current.categoryId || nextCategories[0]?.id || '' }));
    } catch (cause) { const message = (cause as Error).message; setError(message); if (/הרשאה|התחברות/.test(message)) router.push('/login'); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { void load(); }, [load]);

  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(''), 3500); }
  function updateForm<K extends keyof ProductForm>(key: K, value: ProductForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  function productPayload() { return { nameHe: form.nameHe.trim(), descriptionHe: form.descriptionHe.trim(), sku: form.sku.trim(), categoryId: form.categoryId, priceAgorot: Math.round(Number(form.price) * 100), compareAtAgorot: form.compareAt ? Math.round(Number(form.compareAt) * 100) : undefined, quantity: Number(form.quantity), supportsFastDelivery: form.supportsFastDelivery }; }

  async function addProduct(event: FormEvent) {
    event.preventDefault(); setError('');
    const payload = productPayload();
    if (!payload.categoryId || !payload.sku || payload.priceAgorot < 0 || payload.quantity < 0) { setError('יש למלא את כל השדות בערכים תקינים'); return; }
    setSaving(true);
    try { await api.post('/seller/products', payload, token()); setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '' }); notify('המוצר נוסף ופורסם בהצלחה'); setTab('products'); await load(true); }
    catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }

  function openEdit(product: SellerProduct) { setEditing(product); setError(''); }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing || !window.confirm('לשמור את השינויים במוצר?')) return;
    const data = new FormData(event.currentTarget); const price = Number(data.get('price'));
    if (price < 0) { setError('המחיר אינו יכול להיות שלילי'); return; }
    setSaving(true);
    try { await api.patch(`/seller/products/${editing.id}`, { nameHe: String(data.get('nameHe')).trim(), descriptionHe: String(data.get('descriptionHe')).trim(), priceAgorot: Math.round(price * 100), supportsFastDelivery: data.get('supportsFastDelivery') === 'on' }, token()); setEditing(null); notify('פרטי המוצר עודכנו'); await load(true); }
    catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }

  function openStock(product: SellerProduct) { setStockProduct(product); setStockValue(String(product.variants[0]?.inventory?.quantity ?? 0)); setError(''); }
  async function saveStock(event: FormEvent) {
    event.preventDefault(); const quantity = Number(stockValue); const variant = stockProduct?.variants[0];
    if (!variant || !Number.isInteger(quantity) || quantity < 0) { setError('המלאי חייב להיות מספר שלם ואינו יכול להיות שלילי'); return; }
    if (!window.confirm(`לעדכן את המלאי ל-${quantity} יחידות?`)) return;
    setSaving(true);
    try { await api.patch(`/seller/variants/${variant.id}/stock`, { quantity }, token()); setStockProduct(null); notify('המלאי עודכן בהצלחה'); await load(true); }
    catch (cause) { setError((cause as Error).message); } finally { setSaving(false); }
  }

  return <main><Header/>{notice && <div className="sellerToast" role="status">✓ {notice}</div>}<section className={`sellerDashboard wrap ${tab==='orders'?'ordersEnhanced':''}`}><SellerOrdersWorkflow active={tab==='orders'} orders={orders} setOrders={setOrders} token={token} notify={notify} setError={setError}/>
    <div className="sellerTitle"><div><label>אזור מוכרים</label><h1>לוח המוכר</h1><p>ניהול מוצרים, מלאי והזמנות במקום אחד.</p></div><button className="primary" onClick={() => setTab('add')}>＋ מוצר חדש</button></div>
    <nav className="sellerTabs" aria-label="ניווט לוח מוכר">{([['overview','סקירה'],['products','מוצרים'],['add','הוספת מוצר'],['orders','הזמנות']] as [Tab,string][]).map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setError('')}}>{label}</button>)}</nav>
    {error && <div className="sellerAlert error" role="alert">{error}<button onClick={()=>void load()}>נסו שוב</button></div>}
    {loading ? <div className="sellerLoading"><span/><p>טוענים את נתוני החנות…</p></div> : <>
      {tab === 'overview' && <section className="sellerPanel"><h2>סקירה כללית</h2><div className="sellerStats"><article><small>סה״כ מכירות</small><b>{money(stats?.salesAgorot ?? 0)}</b><span>לפני עמלות</span></article><article><small>הזמנות</small><b>{stats?.orders ?? 0}</b><span>{stats?.pendingOrders ?? 0} בטיפול</span></article><article><small>מוצרים</small><b>{stats?.products ?? 0}</b><span>{products.filter(p=>p.status==='ACTIVE').length} פעילים</span></article><article><small>נטו למוכר</small><b>{money(stats?.revenueAgorot ?? 0)}</b><span>לאחר עמלות</span></article></div><div className="sellerSectionHead"><h2>הזמנות אחרונות</h2><button onClick={()=>setTab('orders')}>לכל ההזמנות ←</button></div><OrdersTable orders={orders.slice(0,5)}/></section>}
      {tab === 'products' && <section className="sellerPanel"><div className="sellerSectionHead"><div><h2>המוצרים שלי</h2><p>{products.length} מוצרים בחנות</p></div><button className="primary" onClick={()=>setTab('add')}>הוספת מוצר</button></div>{products.length ? <div className="sellerTableWrap"><table className="sellerTable"><thead><tr><th>מוצר</th><th>SKU</th><th>מחיר</th><th>מלאי</th><th>מצב</th><th>פעולות</th></tr></thead><tbody>{products.map(product=><tr key={product.id}><td><b>{product.nameHe}</b><small>{product.category.nameHe} · {product.images.length} תמונות</small></td><td dir="ltr">{product.sku}</td><td>{money(product.priceAgorot)}</td><td><span className={(product.variants[0]?.inventory?.quantity??0)<5?'lowStock':''}>{product.variants[0]?.inventory?.quantity??0}</span></td><td><span className={`statusBadge status-${product.status.toLowerCase()}`}>{statusLabel[product.status]??product.status}</span></td><td><div className="rowActions"><button onClick={()=>openEdit(product)}>עריכה</button><button onClick={()=>openStock(product)}>מלאי</button><button onClick={()=>setMediaProduct(product)}>תמונות</button></div></td></tr>)}</tbody></table></div> : <Empty title="אין מוצרים עדיין" text="הוסיפו את המוצר הראשון שלכם לחנות." action={()=>setTab('add')}/>}</section>}
      {tab === 'add' && <section className="sellerPanel sellerFormPanel"><div><label>קטלוג</label><h2>הוספת מוצר חדש</h2><p>המוצר יתפרסם מיד ויישאר כפוף למדיניות המוצרים של Shuk.</p></div><ProductFormView form={form} categories={categories} saving={saving} onChange={updateForm} onSubmit={addProduct}/></section>}
      {tab === 'orders' && <section className="sellerPanel"><div className="sellerSectionHead"><div><h2>הזמנות</h2><p>{orders.length} הזמנות התקבלו בחנות</p></div><button onClick={()=>void load(true)}>רענון</button></div><OrdersTable orders={orders}/></section>}
    </>}
  </section>
  {editing && <div className="sellerModalBackdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setEditing(null)}><form className="sellerModal" onSubmit={saveEdit}><button type="button" className="modalClose" onClick={()=>setEditing(null)}>×</button><label>עריכת מוצר</label><h2>{editing.nameHe}</h2><div className="formGrid"><div className="full"><span>שם המוצר</span><input name="nameHe" defaultValue={editing.nameHe} minLength={2} required/></div><div className="full"><span>תיאור</span><textarea name="descriptionHe" defaultValue={editing.descriptionHe} minLength={2} required/></div><div><span>מחיר (₪)</span><input name="price" type="number" min="0" step="0.01" defaultValue={(editing.priceAgorot/100).toFixed(2)} required/></div><label className="checkField"><input name="supportsFastDelivery" type="checkbox" defaultChecked={editing.supportsFastDelivery}/> משלוח מהיר</label></div><p className="formNote">מצב המוצר מנוהל בתהליך האישור ואינו ניתן לשינוי במסך זה.</p><div className="modalActions"><button type="button" onClick={()=>setEditing(null)}>ביטול</button><button className="primary" disabled={saving}>{saving?'שומרים…':'שמירת שינויים'}</button></div></form></div>}
  {mediaProduct&&<ProductMediaManager product={products.find(product=>product.id===mediaProduct.id)??mediaProduct} onClose={()=>setMediaProduct(null)} onChanged={()=>load(true)}/>} {stockProduct && <div className="sellerModalBackdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setStockProduct(null)}><form className="sellerModal small" onSubmit={saveStock}><button type="button" className="modalClose" onClick={()=>setStockProduct(null)}>×</button><label>עדכון מלאי</label><h2>{stockProduct.nameHe}</h2><p>כמות נוכחית: {stockProduct.variants[0]?.inventory?.quantity??0}</p><input className="stockInput" type="number" min="0" step="1" value={stockValue} onChange={e=>setStockValue(e.target.value)} required/><div className="modalActions"><button type="button" onClick={()=>setStockProduct(null)}>ביטול</button><button className="primary" disabled={saving}>{saving?'מעדכנים…':'עדכון מלאי'}</button></div></form></div>}<Footer/></main>;
}

function ProductFormView({ form, categories, saving, onChange, onSubmit }: { form: ProductForm; categories: Category[]; saving: boolean; onChange: <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => void; onSubmit: (event: FormEvent) => void }) {
  return <form className="sellerProductForm" onSubmit={onSubmit}><div className="formGrid"><label className="full"><span>שם המוצר</span><input value={form.nameHe} onChange={e=>onChange('nameHe',e.target.value)} minLength={2} placeholder="לדוגמה: תיק עור מקומי" required/></label><label className="full"><span>תיאור</span><textarea value={form.descriptionHe} onChange={e=>onChange('descriptionHe',e.target.value)} minLength={2} placeholder="ספרו ללקוחות על המוצר" required/></label><label><span>SKU</span><input dir="ltr" value={form.sku} onChange={e=>onChange('sku',e.target.value)} placeholder="SKU-001" required/></label><label><span>קטגוריה</span><select value={form.categoryId} onChange={e=>onChange('categoryId',e.target.value)} required>{categories.map(category=><option key={category.id} value={category.id}>{category.nameHe}</option>)}</select></label><label><span>מחיר (₪)</span><input type="number" min="0" step="0.01" value={form.price} onChange={e=>onChange('price',e.target.value)} required/></label><label><span>מחיר קודם (אופציונלי)</span><input type="number" min="0" step="0.01" value={form.compareAt} onChange={e=>onChange('compareAt',e.target.value)}/></label><label><span>מלאי התחלתי</span><input type="number" min="0" step="1" value={form.quantity} onChange={e=>onChange('quantity',e.target.value)} required/></label><label className="checkField"><input type="checkbox" checked={form.supportsFastDelivery} onChange={e=>onChange('supportsFastDelivery',e.target.checked)}/> זמין למשלוח מהיר</label></div><div className="formActions"><button className="primary" disabled={saving}>{saving?'שומרים מוצר…':'שמירת מוצר'}</button></div></form>;
}

function OrdersTable({ orders }: { orders: SellerOrder[] }) {
  if (!orders.length) return <Empty title="אין הזמנות עדיין" text="הזמנות חדשות שיוזמנו מהחנות יופיעו כאן."/>;
  return <div className="sellerTableWrap"><table className="sellerTable ordersTable"><thead><tr><th>הזמנה</th><th>תאריך</th><th>פריטים</th><th>כתובת משלוח</th><th>סה״כ</th><th>עמלה</th><th>נטו</th><th>מצב</th><th>תשלום</th></tr></thead><tbody>{orders.map(order=><tr key={order.id}><td><b dir="ltr">{order.order.orderNumber}</b></td><td>{new Intl.DateTimeFormat('he-IL',{dateStyle:'short',timeStyle:'short'}).format(new Date(order.order.createdAt))}</td><td><div className="orderItems">{order.items.map(item=><span key={item.id}>{item.productName} × {item.quantity} · {money(item.unitPriceAgorot)} ליחידה</span>)}</div></td><td><ShippingCell address={order.order.shippingAddress}/></td><td>{money(order.subtotalAgorot+order.shippingAgorot)}</td><td>{money(order.commissionAgorot)}</td><td><b>{money(order.netAgorot)}</b></td><td><span className="statusBadge">{statusLabel[order.status]??order.status}</span></td><td>{order.order.payment?<span className="statusBadge">{statusLabel[order.order.payment.status]??order.order.payment.status}</span>:<span className="muted">טרם נוצר</span>}</td></tr>)}</tbody></table></div>;
}
function ShippingCell({address}:{address?:ShippingAddress}){if(!address?.city||!address.street)return <span className="muted">לא נשמרה כתובת</span>;return <div className="shippingCell"><b>{address.fullName}</b><span>{address.street} {address.houseNumber}{address.apartment?`, ${address.apartment}`:''}, {address.city}</span>{address.phone&&<span dir="ltr">{address.phone}</span>}{address.notes&&<small>{address.notes}</small>}</div>}
function Empty({ title, text, action }: { title: string; text: string; action?: () => void }) { return <div className="sellerEmpty"><span>▦</span><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={action}>הוספת מוצר</button>}</div>; }
