const {resolve}=require('node:path');
require('dotenv').config({path:resolve(process.cwd(),process.argv[2]||'.env.staging')});
const errors=[],warnings=[];
const required=['DATABASE_URL','JWT_SECRET','WEB_ORIGIN','APP_URL','NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_API_URL','UPLOAD_ROOT'];
for(const name of required)if(!process.env[name])errors.push(`${name} is required`);
if((process.env.JWT_SECRET||'').length<32||/replace|generate|example/i.test(process.env.JWT_SECRET||''))errors.push('JWT_SECRET must be a real unique secret of at least 32 characters');
function https(name){const value=process.env[name];if(!value)return;try{const url=new URL(value);if(url.protocol!=='https:')errors.push(`${name} must use HTTPS`);if(['localhost','127.0.0.1'].includes(url.hostname))errors.push(`${name} must not use localhost`);}catch{errors.push(`${name} is not a valid URL`);}}
for(const name of ['WEB_ORIGIN','APP_URL','NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_API_URL'])https(name);
if((process.env.WEB_ORIGIN||'').split(',').some(value=>value.trim()==='*'))errors.push('WEB_ORIGIN must not contain *');
try{const database=new URL(process.env.DATABASE_URL);const name=database.pathname.replace(/^\//,'');if(!name)errors.push('DATABASE_URL must name a database');if(name==='marketplace')errors.push('Refusing current/production database named marketplace');if(!/staging/i.test(name))warnings.push('Database name does not visibly identify staging');}catch{errors.push('DATABASE_URL is not a valid PostgreSQL URL');}
if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASSWORD||!process.env.MAIL_FROM)warnings.push('SMTP is not fully configured; password-reset delivery cannot be accepted');
if(process.env.NODE_ENV!=='production')errors.push('NODE_ENV must be production');
console.log(JSON.stringify({ok:errors.length===0,errors,warnings,checked:required},null,2));
process.exitCode=errors.length?1:0;
