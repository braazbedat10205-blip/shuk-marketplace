const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'..','.env')});
const {chromium}=require('playwright-core');
const {PrismaClient}=require('@prisma/client');
const DB_NAME='shuk_launch_readiness_test',API_PORT=4201,WEB_PORT=4301,API=`http://127.0.0.1:${API_PORT}/api`,WEB=`http://127.0.0.1:${WEB_PORT}`;
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',sizes=[[360,800],[390,844],[412,915],[768,1024],[1280,800],[1440,900]];
function testUrl(){const url=new URL(process.env.DATABASE_URL);url.pathname=`/${DB_NAME}`;url.searchParams.delete('schema');return url.toString()}
async function wait(url){for(let i=0;i<120;i++){try{if((await fetch(url)).ok)return}catch{}await delay(250)}throw new Error(`Service unavailable: ${url}`)}
function buildWeb(){return new Promise((resolve,reject)=>{const args=process.platform==='win32'?[path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js'),'run','build','-w','@shuk/web']:['run','build','-w','@shuk/web'];const child=spawn(process.platform==='win32'?process.execPath:'npm',args,{cwd:path.resolve(__dirname,'..'),env:{...process.env,NEXT_PUBLIC_API_URL:API,NEXT_PUBLIC_SITE_URL:WEB,NODE_ENV:'production'},stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`QA web build failed with exit code ${code}`)))})}
async function login(email,password){const response=await fetch(`${API}/auth/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});if(!response.ok)throw new Error(`Login failed for ${email}: ${response.status}`);return(await response.json()).accessToken}
async function audit(page,route){
 const expectedNotFound=route==='/definitely-missing';page.removeAllListeners();const errors=[];page.on('pageerror',error=>errors.push(String(error.message)));page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('favicon')&&!(expectedNotFound&&message.text().includes('404 (Not Found)')))errors.push(message.text())});page.on('response',response=>{if(response.status()>=400&&!(expectedNotFound&&response.status()===404&&new URL(response.url()).pathname===route))errors.push(`HTTP ${response.status()} ${response.url()}`)});
 await page.goto(`${WEB}${route}`,{waitUntil:'networkidle',timeout:30000});await page.waitForTimeout(250);
 return page.evaluate(({route,errors})=>{const visible=element=>{const style=getComputedStyle(element),rect=element.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0};const outside=[...document.querySelectorAll('button,a,input,select,textarea,img')].filter(visible).filter(element=>{const r=element.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5}).slice(0,8).map(element=>`${element.tagName}.${element.className}`);return{route,viewport:`${innerWidth}x${innerHeight}`,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,outside,unnamedButtons:[...document.querySelectorAll('button')].filter(visible).filter(button=>!(button.textContent?.trim()||button.getAttribute('aria-label')||button.getAttribute('title'))).length,missingAlt:[...document.querySelectorAll('img')].filter(image=>!image.hasAttribute('alt')).length,pageErrors:errors,dir:document.documentElement.dir,lang:document.documentElement.lang}},{route,errors});
}
async function auditAdminNavigation(page){
 const expected=['סקירה','משתמשים','מוכרים','מוצרים','קטגוריות','הזמנות','כספים'],errors=[];
 const trigger=page.locator('.adminMenuButton');await trigger.click();
 const navigation=page.locator('#admin-navigation');await navigation.waitFor({state:'visible'});
 const labels=await navigation.locator('button:not(.adminNavClose)').allTextContents();
 if(JSON.stringify(labels.map(value=>value.trim()))!==JSON.stringify(expected))errors.push(`Admin destinations mismatch: ${JSON.stringify(labels)}`);
 const overflow=await page.evaluate(()=>{const nav=document.querySelector('#admin-navigation'),rect=nav?.getBoundingClientRect();return !rect||rect.left<-.5||rect.right>innerWidth+.5||rect.top<-.5||rect.bottom>innerHeight+.5});
 if(overflow)errors.push('Admin drawer is outside the viewport');
 await page.keyboard.press('Escape');if(await navigation.isVisible())errors.push('Escape did not close admin drawer');
 if(!(await trigger.evaluate(element=>document.activeElement===element)))errors.push('Focus was not restored to admin menu button');
 await trigger.click();await navigation.locator('button',{hasText:'משתמשים'}).click();if(await navigation.isVisible())errors.push('Selecting an admin destination did not close drawer');
 return{route:'/admin#mobile-navigation',horizontalOverflow:false,outside:[],unnamedButtons:0,missingAlt:0,pageErrors:errors,dir:await page.locator('html').getAttribute('dir'),lang:await page.locator('html').getAttribute('lang')};
}
async function main(){
 const prisma=new PrismaClient({datasourceUrl:testUrl()});let api,web,browser;
 try{
  const[{database}]=await prisma.$queryRawUnsafe('SELECT current_database() AS database');if(database!==DB_NAME)throw new Error(`Refusing QA against ${database}`);
  const products=await prisma.$queryRawUnsafe('SELECT p.id,p.slug,p."nameHe",p."priceAgorot",v.id AS "variantId",i.quantity FROM "Product" p JOIN "ProductVariant" v ON v."productId"=p.id JOIN "Inventory" i ON i."variantId"=v.id WHERE p.status=\'ACTIVE\' AND i.quantity>0 ORDER BY p."createdAt" LIMIT 1');if(!products.length)throw new Error('No in-stock active test product');const row=products[0],product={id:row.id,slug:row.slug,nameHe:row.nameHe,priceAgorot:row.priceAgorot,variants:[{id:row.variantId,inventory:{quantity:row.quantity}}]};const orders=await prisma.$queryRawUnsafe('SELECT o.id FROM "Order" o JOIN "User" u ON u.id=o."userId" WHERE u.email=\'customer.launch@test.invalid\' ORDER BY o."createdAt" DESC LIMIT 1');if(!orders.length)throw new Error('No customer test order');const order=orders[0];const secret=randomBytes(48).toString('base64url');
  await buildWeb();api=spawn(process.execPath,['apps/api/dist/main.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,DATABASE_URL:testUrl(),JWT_SECRET:secret,PORT:String(API_PORT),WEB_ORIGIN:WEB,APP_URL:WEB,NODE_ENV:'test'},stdio:'ignore'});web=spawn(process.execPath,['node_modules/next/dist/bin/next','start','apps/web','-p',String(WEB_PORT)],{cwd:path.resolve(__dirname,'..'),env:{...process.env,NEXT_PUBLIC_API_URL:API,NEXT_PUBLIC_SITE_URL:WEB,NODE_ENV:'production'},stdio:'ignore'});await Promise.all([wait(`${API}/health`),wait(WEB)]);
  const[customerToken,sellerToken,adminToken]=await Promise.all([login('customer.launch@test.invalid','Launch-Test1!Safe'),login('seller.a.launch@test.invalid','Launch-New2!Safe'),login('admin.launch@test.invalid','Launch-Test1!Safe')]);browser=await chromium.launch({executablePath:EDGE,headless:true});const report=[];
  const customerRoutes=['/',`/?q=${encodeURIComponent('מוצר')}`,`/product/${product.slug}`,'/cart','/checkout',`/payment?orderId=${order.id}`,'/orders',`/orders/${order.id}`,'/account','/login','/become-seller','/definitely-missing'];
  for(const[width,height]of sizes){
   const context=await browser.newContext({viewport:{width,height},locale:'he-IL',isMobile:width<768,hasTouch:width<768});await context.addInitScript(({customerToken,product})=>{localStorage.setItem('shuk-token',customerToken);localStorage.setItem('shuk-cart',JSON.stringify([{productId:product.id,variantId:product.variants[0].id,slug:product.slug,name:product.nameHe,priceAgorot:product.priceAgorot,quantity:1,availableQuantity:product.variants[0].inventory.quantity,sellerName:'חנות אלפא'}]))},{customerToken,product});const page=await context.newPage();for(const route of customerRoutes)report.push({size:`${width}x${height}`,...await audit(page,route)});await context.close();
   for(const[role,token,route]of [['seller',sellerToken,'/seller-dashboard'],['admin',adminToken,'/admin']]){const roleContext=await browser.newContext({viewport:{width,height},locale:'he-IL',isMobile:width<768,hasTouch:width<768});await roleContext.addInitScript(value=>localStorage.setItem('shuk-token',value),token);const rolePage=await roleContext.newPage();report.push({size:`${width}x${height}`,role,...await audit(rolePage,route)});if(role==='admin'&&width<=412)report.push({size:`${width}x${height}`,role,...await auditAdminNavigation(rolePage)});await roleContext.close()}
  }
  const failures=report.filter(result=>result.horizontalOverflow||result.outside.length||result.unnamedButtons||result.missingAlt||result.pageErrors.length||result.dir!=='rtl'||result.lang!=='he');console.log(JSON.stringify({database:DB_NAME,sizes:sizes.map(size=>size.join('x')),pagesPerViewport:customerRoutes.length+2,checks:report.length,failures,passed:report.length-failures.length},null,2));if(failures.length)process.exitCode=1;
 }finally{if(browser)await browser.close();if(web)web.kill('SIGTERM');if(api)api.kill('SIGTERM');await prisma.$disconnect()}
}
main().catch(error=>{console.error(String(error?.stack||error).replace(/postgresql:\/\/\S+/gi,'<redacted-url>'));process.exitCode=1});
