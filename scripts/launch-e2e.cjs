const { spawn } = require('node:child_process');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');
const jwt = require('jsonwebtoken');

const TEST_DATABASE_NAME = 'shuk_launch_readiness_test';
const PORT = 4201;
const BASE = `http://127.0.0.1:${PORT}/api`;
const PASSWORD = 'Launch-Test1!Safe';
const JWT_SECRET = randomBytes(48).toString('base64url');
const results = [];

function testUrl() {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${TEST_DATABASE_NAME}`;
  url.searchParams.delete('schema');
  return url.toString();
}
function ok(name, condition, detail = '') {
  if (!condition) throw new Error(`${name}: ${detail || 'assertion failed'}`);
  results.push({ name, result: 'PASS', detail });
}
function cookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}
async function request(pathname, { method = 'GET', token, body, headers = {}, cookie: requestCookie, signal } = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method, signal,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(requestCookie ? { cookie: requestCookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data, response, cookie: cookie(response) };
}
async function register(email, firstName = 'Test', lastName = 'User') {
  return request('/auth/register', { method: 'POST', body: { email, password: PASSWORD, firstName, lastName } });
}
async function login(email, password = PASSWORD) {
  return request('/auth/login', { method: 'POST', body: { email, password } });
}
async function retryCheckout(token,key,body,attempt){
  let result=attempt;
  for(let retry=0;result.status===409&&retry<2;retry++){await delay(40*(retry+1));result=await request('/checkout/orders',{method:'POST',token,headers:{'idempotency-key':key},body});}
  return result;
}
async function uploadPng(productId, token, label) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const form = new FormData(); form.append('images', new Blob([png], { type: 'image/png' }), `${label}.png`);
  const response = await fetch(`${BASE}/seller/products/${productId}/images`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  return { status: response.status, data: await response.json().catch(() => null) };
}
async function waitForApi() {
  for (let index = 0; index < 60; index++) {
    try { const response = await fetch(`${BASE}/health`); if (response.ok) return; } catch {}
    await delay(250);
  }
  throw new Error('Test API did not become healthy');
}
function startApi() {
  return spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, DATABASE_URL: testUrl(), JWT_SECRET, PORT: String(PORT), WEB_ORIGIN: 'http://127.0.0.1:4301', APP_URL: 'http://127.0.0.1:4301', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'pipe'] });
}
async function clean(prisma) {
  const [{ database }] = await prisma.$queryRawUnsafe('SELECT current_database() AS database');
  if (database !== TEST_DATABASE_NAME) throw new Error(`REFUSING TO MUTATE DATABASE: ${database}`);
  const tables = await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'");
  const safeTables = tables.map(({ tablename }) => `"${String(tablename).replaceAll('"', '""')}"`).join(',');
  if (safeTables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${safeTables} RESTART IDENTITY CASCADE`);
}
async function seedAdmin(prisma) {
  return prisma.user.create({ data: { email: 'admin.launch@test.invalid', passwordHash: await hash(PASSWORD, 12), firstName: 'Launch', lastName: 'Admin', roles: { create: [{ role: 'CUSTOMER' }, { role: 'ADMIN' }] } } });
}
async function createSellerProduct(token, categoryId, sku, quantity, priceAgorot = 12500) {
  return request('/seller/products', { method: 'POST', token, body: { nameHe: `מוצר בדיקה ${sku}`, descriptionHe: 'מוצר מוגבל לבדיקות Launch Readiness במסד הנתונים המבודד בלבד.', categoryId, sku, priceAgorot, quantity, supportsFastDelivery: true } });
}

async function main() {
  const prisma = new PrismaClient({ datasourceUrl: testUrl() });
  let api;
  try {
    await clean(prisma);
    const before = { users: await prisma.user.count(), sellers: await prisma.sellerProfile.count(), products: await prisma.product.count(), orders: await prisma.order.count(), payments: await prisma.payment.count() };
    ok('Test DB starts empty', Object.values(before).every(value => value === 0), JSON.stringify(before));
    const category = await prisma.category.create({ data: { slug: 'launch-test', nameHe: 'בדיקות השקה', active: true } });
    await seedAdmin(prisma);

    api = startApi();
    let apiErrors = '';
    api.stderr.on('data', chunk => { apiErrors += String(chunk).replace(/postgresql:\/\/\S+/gi, '<redacted-url>'); });
    await waitForApi();
    const health = await request('/health'); ok('API health', health.status === 200 && health.data.status === 'ok');
    const readiness = await request('/health/ready'); ok('API database readiness', readiness.status === 200 && readiness.data.status === 'ready' && readiness.data.checks.database === 'up');
    ok('Correlation header', Boolean(health.response.headers.get('x-request-id')));
    ok('Security headers', health.response.headers.get('x-content-type-options') === 'nosniff' && Boolean(health.response.headers.get('x-frame-options')));
    const allowedPreflight=await fetch(`${BASE}/health`,{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:4301','Access-Control-Request-Method':'GET'}});ok('CORS allows configured web origin',allowedPreflight.headers.get('access-control-allow-origin')==='http://127.0.0.1:4301');
    const rejectedPreflight=await fetch(`${BASE}/health`,{method:'OPTIONS',headers:{Origin:'https://evil.invalid','Access-Control-Request-Method':'GET'}});ok('CORS does not allow unknown origin',!rejectedPreflight.headers.get('access-control-allow-origin'));

    const malformed = await request('/auth/register', { method: 'POST', body: { email: 'bad' } }); ok('Register malformed', malformed.status === 400);
    const weak = await request('/auth/register', { method: 'POST', body: { email: 'weak@test.invalid', password: 'weak', firstName: 'W', lastName: 'P' } }); ok('Register weak password', weak.status === 400);
    const customer = await register('customer.launch@test.invalid', 'Customer', 'Launch'); ok('Register valid customer', customer.status === 201);
    const duplicate = await register('customer.launch@test.invalid'); ok('Register duplicate', duplicate.status === 409);
    const wrongPassword = await login('customer.launch@test.invalid', 'Wrong-Test1!Password'); ok('Login wrong password', wrongPassword.status === 401);
    const customerLogin = await login('customer.launch@test.invalid'); ok('Login customer', customerLogin.status === 201 && customerLogin.data.accessToken);
    const customerToken = customerLogin.data.accessToken;

    const adminLogin = await login('admin.launch@test.invalid'); ok('Login admin', adminLogin.status === 201);
    const adminToken = adminLogin.data.accessToken;
    ok('Customer blocked from admin API', (await request('/admin/dashboard', { token: customerToken })).status === 403);
    ok('Admin dashboard', (await request('/admin/dashboard', { token: adminToken })).status === 200);
    ok('Admin users pagination/search', (await request('/admin/users?search=customer&page=1&limit=1', { token: adminToken })).status === 200);

    const candidate = await register('seller.a.launch@test.invalid', 'Seller', 'Alpha');
    const application = await request('/seller/apply', { method: 'POST', token: candidate.data.accessToken, body: { storeName: 'חנות אלפא', storeDescription: 'תיאור חנות בדיקה מאושר וארוך מספיק.', phone: '0500000101', city: 'חיפה', address: 'רחוב הבדיקה 1', activityType: 'מוצרי בדיקה' } });
    ok('Seller application', application.status === 201 && application.data.status === 'PENDING');
    ok('Pending seller blocked from create', (await createSellerProduct(candidate.data.accessToken, category.id, 'PENDING-SKU', 1)).status === 403);
    const approval = await request(`/admin/sellers/${application.data.id}/status`, { method: 'PATCH', token: adminToken, body: { status: 'APPROVED' } }); ok('Admin approves seller', approval.status === 200);
    ok('Duplicate admin seller action is rejected', (await request(`/admin/sellers/${application.data.id}/status`, { method: 'PATCH', token: adminToken, body: { status: 'APPROVED' } })).status === 409);
    const sellerLogin = await login('seller.a.launch@test.invalid'); ok('Approved seller login', sellerLogin.status === 201 && sellerLogin.data.user.roles.includes('SELLER'));
    const sellerToken = sellerLogin.data.accessToken;
    ok('Seller blocked from admin API', (await request('/admin/dashboard', { token: sellerToken })).status === 403);

    const product = await createSellerProduct(sellerToken, category.id, 'LAUNCH-A-001', 8); ok('Seller creates active product', product.status === 201 && product.data.status === 'ACTIVE');
    const variant = product.data.variants[0];
    ok('Invalid product price rejected', (await createSellerProduct(sellerToken, category.id, 'BAD-PRICE', 1, 0)).status === 400);
    ok('Duplicate seller SKU rejected', (await createSellerProduct(sellerToken, category.id, 'LAUNCH-A-001', 1)).status === 409);
    ok('Negative stock rejected', (await request(`/seller/variants/${variant.id}/stock`, { method: 'PATCH', token: sellerToken, body: { quantity: -1 } })).status === 400);
    ok('Seller edits own product', (await request(`/seller/products/${product.data.id}`, { method: 'PATCH', token: sellerToken, body: { nameHe: 'מוצר אלפא מעודכן', priceAgorot: 13000 } })).status === 200);

    const candidateB = await register('seller.b.launch@test.invalid', 'Seller', 'Beta');
    const applicationB = await request('/seller/apply', { method: 'POST', token: candidateB.data.accessToken, body: { storeName: 'חנות בטא', storeDescription: 'תיאור חנות בטא לבדיקת הרשאות מלאה.', phone: '0500000102', city: 'עכו', address: 'רחוב הבדיקה 2', activityType: 'מוצרי בדיקה' } });
    await request(`/admin/sellers/${applicationB.data.id}/status`, { method: 'PATCH', token: adminToken, body: { status: 'APPROVED' } });
    const sellerBLogin = await login('seller.b.launch@test.invalid'); const sellerBToken = sellerBLogin.data.accessToken;
    const productB = await createSellerProduct(sellerBToken, category.id, 'LAUNCH-B-001', 4);
    ok('Seller A cannot edit Seller B product', (await request(`/seller/products/${productB.data.id}`, { method: 'PATCH', token: sellerToken, body: { nameHe: 'אסור לערוך' } })).status === 404);
    ok('Seller A cannot edit Seller B inventory', (await request(`/seller/variants/${productB.data.variants[0].id}/stock`, { method: 'PATCH', token: sellerToken, body: { quantity: 99 } })).status === 404);
    ok('Customer blocked from seller API', (await request('/seller/products', { token: customerToken })).status === 403);
    const firstImage=await uploadPng(product.data.id,sellerToken,'first'),secondImage=await uploadPng(product.data.id,sellerToken,'second');ok('Seller uploads valid product images',firstImage.status===201&&secondImage.status===201);
    const madePrimary=await request(`/seller/products/${product.data.id}/images/${secondImage.data[0].id}`,{method:'PATCH',token:sellerToken,body:{isPrimary:true}});ok('Seller reorders product images',madePrimary.status===200&&madePrimary.data[0].id===secondImage.data[0].id&&madePrimary.data.every((image,index)=>image.position===index));
    ok('Other seller cannot manage product images',(await request(`/seller/products/${product.data.id}/images/${firstImage.data[0].id}`,{method:'PATCH',token:sellerBToken,body:{position:0}})).status===404);
    const deletedImage=await request(`/seller/products/${product.data.id}/images/${firstImage.data[0].id}`,{method:'DELETE',token:sellerToken});ok('Seller deletes product image',deletedImage.status===200&&deletedImage.data.images.length===1);
    await request(`/seller/products/${product.data.id}/images/${secondImage.data[0].id}`,{method:'DELETE',token:sellerToken});

    const catalog = await request('/products?search=אלפא&inStock=true&sort=price_asc'); ok('Marketplace search/filter/sort', catalog.status === 200 && catalog.data.data.some(item => item.id === product.data.id));
    ok('Product details', (await request(`/products/${product.data.slug}`)).status === 200);
    ok('Discovery sitemap endpoint', (await request('/discovery/sitemap')).data.products.some(item => item.slug === product.data.slug));

    const address = await request('/addresses', { method: 'POST', token: customerToken, body: { fullName: 'לקוח בדיקה', phone: '0500000200', city: 'ירושלים', street: 'רחוב השקה', houseNumber: '10', postalCode: '9100000', isDefault: true } }); ok('Customer creates address', address.status === 201);
    const cart = { items: [{ productId: product.data.id, variantId: variant.id, quantity: 1 }], addressId: address.data.id };
    const quote = await request('/checkout/quote', { method: 'POST', body: { items: cart.items } }); ok('Checkout quote uses backend pricing', quote.status === 201 && quote.data.subtotalAgorot === 13000);
    const multiUser=await prisma.user.create({data:{email:'multi.customer.launch@test.invalid',passwordHash:await hash(PASSWORD,12),firstName:'Multi',lastName:'Customer',roles:{create:{role:'CUSTOMER'}}}}),multiSession=await prisma.authSession.create({data:{userId:multiUser.id,familyId:randomUUID(),tokenHash:createHash('sha256').update(randomBytes(32)).digest('hex'),expiresAt:new Date(Date.now()+3600000)}}),multiToken=jwt.sign({sub:multiUser.id,email:multiUser.email,roles:['CUSTOMER'],sid:multiSession.id},JWT_SECRET,{algorithm:'HS256',issuer:'shuk-api',audience:'shuk-web',expiresIn:900}),multiCustomer={data:{accessToken:multiToken}},multiAddress=await request('/addresses',{method:'POST',token:multiCustomer.data.accessToken,body:{fullName:'לקוח רב מוכרים',phone:'0500000209',city:'חולון',street:'רחוב הקבלה',houseNumber:'12',isDefault:true}});
    const multiItems=[{productId:product.data.id,variantId:variant.id,quantity:2},{productId:productB.data.id,variantId:productB.data.variants[0].id,quantity:1}],multiQuote=await request('/checkout/quote',{method:'POST',body:{items:multiItems}});ok('Multi-seller quote uses backend prices',multiQuote.status===201&&multiQuote.data.sellerOrders.length===2&&multiQuote.data.totalAgorot===multiQuote.data.sellerOrders.reduce((sum,group)=>sum+group.subtotalAgorot+group.shippingAgorot,0));
    const stockABefore=(await prisma.inventory.findUnique({where:{variantId:variant.id}})).quantity,stockBBefore=(await prisma.inventory.findUnique({where:{variantId:productB.data.variants[0].id}})).quantity,multiKey='multi-seller-acceptance',multi=await request('/checkout/orders',{method:'POST',token:multiCustomer.data.accessToken,headers:{'idempotency-key':multiKey},body:{items:multiItems,addressId:multiAddress.data.id}});ok('Multi-seller checkout splits one order',multi.status===201&&multi.data.sellerOrders.length===2&&new Set(multi.data.sellerOrders.map(group=>group.sellerId)).size===2);
    ok('Multi-seller stock decrements exactly once',(await prisma.inventory.findUnique({where:{variantId:variant.id}})).quantity===stockABefore-2&&(await prisma.inventory.findUnique({where:{variantId:productB.data.variants[0].id}})).quantity===stockBBefore-1);
    const multiRetry=await request('/checkout/orders',{method:'POST',token:multiCustomer.data.accessToken,headers:{'idempotency-key':multiKey},body:{items:multiItems,addressId:multiAddress.data.id}});ok('Multi-seller duplicate submit returns original order',multiRetry.status===201&&multiRetry.data.id===multi.data.id&&await prisma.order.count({where:{id:multi.data.id}})===1);
    const [sellerAView,sellerBView,customerView]=await Promise.all([request('/seller/orders',{token:sellerToken}),request('/seller/orders',{token:sellerBToken}),request(`/orders/${multi.data.id}`,{token:multiCustomer.data.accessToken})]);ok('Each seller sees only own multi-seller part',sellerAView.data.find(group=>group.orderId===multi.data.id)?.sellerId===application.data.id&&sellerBView.data.find(group=>group.orderId===multi.data.id)?.sellerId===applicationB.data.id);ok('Customer sees complete multi-seller order',customerView.status===200&&customerView.data.sellerOrders.length===2);
    await request(`/orders/${multi.data.id}/cancel`,{method:'PATCH',token:multiCustomer.data.accessToken,body:{}});
    await request(`/admin/products/${productB.data.id}/status`,{method:'PATCH',token:adminToken,body:{status:'ARCHIVED'}});ok('Inactive product rejected during checkout',(await request('/checkout/quote',{method:'POST',body:{items:[multiItems[1]]}})).status===400);await request(`/admin/products/${productB.data.id}/status`,{method:'PATCH',token:adminToken,body:{status:'ACTIVE'}});
    const rollbackStock = (await prisma.inventory.findUnique({ where: { variantId: variant.id } })).quantity;
    const rollback = await request('/checkout/orders', { method: 'POST', token: customerToken, headers: { 'idempotency-key': 'rollback-test-key' }, body: { ...cart, addressId: '00000000-0000-4000-8000-000000000099' } });
    ok('Failed checkout rejected', rollback.status === 400);
    ok('Failed checkout fully rolls back', (await prisma.inventory.findUnique({ where: { variantId: variant.id } })).quantity === rollbackStock && await prisma.idempotencyRecord.count({ where: { key: 'rollback-test-key' } }) === 0);

    const sameKey = 'same-key-concurrency';
    const [sameOne, sameTwo] = await Promise.all([request('/checkout/orders', { method: 'POST', token: customerToken, headers: { 'idempotency-key': sameKey }, body: cart }), request('/checkout/orders', { method: 'POST', token: customerToken, headers: { 'idempotency-key': sameKey }, body: cart })]);
    ok('Concurrent same idempotency key has one order', [sameOne.status, sameTwo.status].every(status => [201, 409].includes(status)) && await prisma.idempotencyRecord.count({ where: { key: sameKey, status: 'SUCCEEDED' } }) === 1);
    const sameOrder = await prisma.order.findFirst({ where: { idempotencyRecords: { some: { key: sameKey } } } });
    const retry = await request('/checkout/orders', { method: 'POST', token: customerToken, headers: { 'idempotency-key': sameKey }, body: cart }); ok('Network retry returns original order', retry.status === 201 && retry.data.id === sameOrder.id);
    const changedPayload = await request('/checkout/orders', { method: 'POST', token: customerToken, headers: { 'idempotency-key': sameKey }, body: { ...cart, items: [{ ...cart.items[0], quantity: 2 }] } }); ok('Same key different payload is conflict', changedPayload.status === 409);

    const concurrencyCustomer = await register('concurrency.customer.launch@test.invalid', 'Concurrency', 'Customer');
    const concurrencyAddress = await request('/addresses', { method: 'POST', token: concurrencyCustomer.data.accessToken, body: { fullName: 'לקוח מקביל', phone: '0500000201', city: 'תל אביב', street: 'רחוב מקביל', houseNumber: '11', isDefault: true } });
    const concurrencyCart = { items: cart.items, addressId: concurrencyAddress.data.id };
    const differentKeysBefore = await prisma.order.count();
    const differentKeys = ['different-key-one', 'different-key-two'];
    const firstAttempts = await Promise.all(differentKeys.map(key => request('/checkout/orders', { method: 'POST', token: concurrencyCustomer.data.accessToken, headers: { 'idempotency-key': key }, body: concurrencyCart })));
    const differentResults = await Promise.all(firstAttempts.map((attempt, index) => retryCheckout(concurrencyCustomer.data.accessToken,differentKeys[index],concurrencyCart,attempt)));
    const differentKeysAfter=await prisma.order.count();ok('Same payload different keys creates distinct orders', differentResults.every(result => result.status === 201) && differentResults[0].data.id !== differentResults[1].data.id && differentKeysAfter === differentKeysBefore + 2,JSON.stringify({statuses:differentResults.map(result=>result.status),before:differentKeysBefore,after:differentKeysAfter}));

    const scarce = await createSellerProduct(sellerToken, category.id, 'LAUNCH-SCARCE', 1, 9900); const scarceCart = { items: [{ productId: scarce.data.id, variantId: scarce.data.variants[0].id, quantity: 1 }], addressId: address.data.id };
    const scarceConcurrencyCart = { ...scarceCart, addressId: concurrencyAddress.data.id };
    const [scarceOne, scarceTwo] = await Promise.all(['scarce-key-one', 'scarce-key-two'].map(key => request('/checkout/orders', { method: 'POST', token: concurrencyCustomer.data.accessToken, headers: { 'idempotency-key': key }, body: scarceConcurrencyCart })));
    ok('Stock 1 concurrency allows one purchase', [scarceOne.status, scarceTwo.status].filter(status => status === 201).length === 1);
    ok('Inventory never negative', (await prisma.inventory.findUnique({ where: { variantId: scarce.data.variants[0].id } })).quantity === 0);

    const sellerOrders = await request('/seller/orders', { token: sellerToken }); ok('Seller sees own order', sellerOrders.status === 200 && sellerOrders.data.some(group => group.order.orderNumber === sameOrder.orderNumber));
    const ownSellerOrder = sellerOrders.data.find(group => group.order.orderNumber === sameOrder.orderNumber);
    ok('Seller B cannot view Seller A order', (await request(`/seller/orders/${ownSellerOrder.id}`, { token: sellerBToken })).status === 404);
    ok('Customer sees My Orders', (await request('/orders/my', { token: customerToken })).data.some(order => order.id === sameOrder.id));
    ok('Customer cannot see another customer order', (await request(`/orders/${sameOrder.id}`, { token: concurrencyCustomer.data.accessToken })).status === 404);
    ok('Payment remains placeholder', (await request(`/payments/orders/${sameOrder.id}`, { token: customerToken })).data.state === 'PENDING_PAYMENT' && await prisma.payment.count() === 0);
    const stockBeforeCancel = (await prisma.inventory.findUnique({ where: { variantId: variant.id } })).quantity;
    const cancelled = await request(`/orders/${sameOrder.id}/cancel`, { method: 'PATCH', token: customerToken, body: {} }); ok('Customer cancels pending order', cancelled.status === 200 && cancelled.data.status === 'CANCELLED');
    ok('Cancel restores inventory', (await prisma.inventory.findUnique({ where: { variantId: variant.id } })).quantity === stockBeforeCancel + 1);

    ok('Admin orders search/pagination', (await request(`/admin/orders-managed?search=${encodeURIComponent(sameOrder.orderNumber)}&page=1&limit=1`, { token: adminToken })).status === 200);
    ok('Admin order details', (await request(`/admin/orders-managed/${sameOrder.id}`, { token: adminToken })).status === 200);
    ok('Admin empty results', (await request('/admin/orders-managed?search=definitely-no-result&page=1&limit=10', { token: adminToken })).data.pagination.total === 0);
    ok('Invalid admin seller filter', (await request('/admin/orders-managed?sellerId=bad-id', { token: adminToken })).status === 400);

    const workflowOrderId = differentResults[0].data.id;
    const workflowGroup = await prisma.sellerOrder.findFirstOrThrow({ where: { orderId: workflowOrderId, sellerId: application.data.id } });
    await prisma.$transaction([
      prisma.payment.create({ data: { orderId: workflowOrderId, provider: 'launch-test-placeholder', status: 'CAPTURED', amountAgorot: differentResults[0].data.totalAgorot } }),
      prisma.order.update({ where: { id: workflowOrderId }, data: { status: 'PAID' } }),
      prisma.sellerOrder.update({ where: { id: workflowGroup.id }, data: { status: 'PAID' } }),
    ]);
    for (const status of ['PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED']) {
      const transition = await request(`/seller/orders/${workflowGroup.id}/status`, { method: 'PATCH', token: sellerToken, body: { status } });
      ok(`Seller order transition ${status}`, transition.status === 200 && transition.data.status === status);
    }
    await prisma.payment.delete({ where: { orderId: workflowOrderId } });
    ok('Payment simulation was test-only and removed', await prisma.payment.count() === 0);
    await prisma.sellerProfile.update({ where: { id: applicationB.data.id }, data: { status: 'REJECTED' } });
    ok('Rejected seller blocked from create', (await createSellerProduct(sellerBToken, category.id, 'REJECTED-SKU', 1)).status === 403);

    const expPayload = { sub: customer.data.user.id, email: customer.data.user.email, roles: ['CUSTOMER'], sid: (await prisma.authSession.findFirst({ where: { userId: customer.data.user.id, revokedAt: null } })).id };
    const expired = jwt.sign(expPayload, JWT_SECRET, { algorithm: 'HS256', issuer: 'shuk-api', audience: 'shuk-web', expiresIn: -1 }); ok('Expired access token rejected', (await request('/auth/me', { token: expired })).status === 401);
    const wrongIssuer = jwt.sign(expPayload, JWT_SECRET, { algorithm: 'HS256', issuer: 'wrong', audience: 'shuk-web', expiresIn: 60 }); ok('Wrong issuer rejected', (await request('/auth/me', { token: wrongIssuer })).status === 401);
    const wrongAudience = jwt.sign(expPayload, JWT_SECRET, { algorithm: 'HS256', issuer: 'shuk-api', audience: 'wrong', expiresIn: 60 }); ok('Wrong audience rejected', (await request('/auth/me', { token: wrongAudience })).status === 401);
    const wrongAlgorithm = jwt.sign(expPayload, JWT_SECRET, { algorithm: 'HS384', issuer: 'shuk-api', audience: 'shuk-web', expiresIn: 60 }); ok('Wrong JWT algorithm rejected', (await request('/auth/me', { token: wrongAlgorithm })).status === 401);
    ok('Invalid access token rejected', (await request('/auth/me', { token: 'not-a-jwt' })).status === 401);

    const refreshLogin = await login('concurrency.customer.launch@test.invalid'); const originalRefresh = refreshLogin.cookie;
    const rotated = await request('/auth/refresh', { method: 'POST', cookie: originalRefresh }); ok('Refresh rotates session', rotated.status === 201 && rotated.cookie && rotated.cookie !== originalRefresh);
    ok('Refresh reuse detected', (await request('/auth/refresh', { method: 'POST', cookie: originalRefresh })).status === 401);
    ok('Reuse revokes token family', (await request('/auth/me', { token: rotated.data.accessToken })).status === 401);
    const expiredRefreshLogin = await login('customer.launch@test.invalid');
    await prisma.authSession.updateMany({ where: { userId: customer.data.user.id, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    ok('Expired refresh rejected', (await request('/auth/refresh', { method: 'POST', cookie: expiredRefreshLogin.cookie })).status === 401);
    const concurrentRefreshLogin = await login('admin.launch@test.invalid');
    const concurrentRefresh = await Promise.all([request('/auth/refresh', { method: 'POST', cookie: concurrentRefreshLogin.cookie }), request('/auth/refresh', { method: 'POST', cookie: concurrentRefreshLogin.cookie })]);
    ok('Concurrent refresh allows only one rotation', concurrentRefresh.filter(result => result.status === 201).length === 1 && concurrentRefresh.filter(result => result.status === 401).length === 1);

    const logoutLogin = await login('seller.b.launch@test.invalid'); const logout = await request('/auth/logout', { method: 'POST', cookie: logoutLogin.cookie }); ok('Logout current session', logout.status === 201 && (await request('/auth/me', { token: logoutLogin.data.accessToken })).status === 401);
    const logoutAllLogin = await login('seller.b.launch@test.invalid'); ok('Logout all sessions', (await request('/auth/logout-all', { method: 'POST', token: logoutAllLogin.data.accessToken })).status === 201 && (await request('/auth/me', { token: logoutAllLogin.data.accessToken })).status === 401);

    const resetLogin = await login('seller.a.launch@test.invalid'); const rawReset = randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({ data: { userId: sellerLogin.data.user.id, tokenHash: createHash('sha256').update(rawReset).digest('hex'), expiresAt: new Date(Date.now() + 60_000) } });
    ok('Password reset succeeds', (await request('/auth/reset-password', { method: 'POST', body: { token: rawReset, password: 'Launch-New2!Safe' } })).status === 201);
    ok('Password reset revokes sessions', (await request('/auth/me', { token: resetLogin.data.accessToken })).status === 401);

    api.kill('SIGTERM'); await delay(500); api = startApi(); await waitForApi();
    const suspended = await prisma.user.update({ where: { email: 'concurrency.customer.launch@test.invalid' }, data: { suspendedAt: new Date() } });
    ok('Suspended user login rejected', (await login(suspended.email)).status === 401);
    let rateLimited = false; for (let i = 0; i < 11; i++) { const attempt = await login('missing.launch@test.invalid'); if (attempt.status === 429) { rateLimited = true; break; } } ok('Login rate limit', rateLimited);

    const after = { users: await prisma.user.count(), sellers: await prisma.sellerProfile.count(), products: await prisma.product.count(), orders: await prisma.order.count(), payments: await prisma.payment.count() };
    console.log(JSON.stringify({ database: TEST_DATABASE_NAME, before, after, tests: results, paymentProviderConnected: false, apiErrors: apiErrors.trim() ? 'API emitted stderr; inspect separately' : 'none' }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ database: TEST_DATABASE_NAME, tests: results, failure: String(error?.stack || error).replace(/postgresql:\/\/\S+/gi, '<redacted-url>') }, null, 2));
    process.exitCode = 1;
  } finally {
    if (api) { api.kill('SIGTERM'); await delay(300); if (!api.killed) api.kill('SIGKILL'); }
    await prisma.$disconnect();
  }
}
main();
