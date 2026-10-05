"use client";

import Link from 'next/link';
import {FormEvent,useState} from 'react';
import {useRouter} from 'next/navigation';
import {api,ApiError} from '../../lib/api';
import {Header} from '../../components/site-shell';
import {PASSWORD_MAX_LENGTH,PASSWORD_MIN_LENGTH,passwordRequirements,passwordValidationMessage} from '../../lib/password-policy';

type Session={accessToken:string;user:{roles:string[]}};

function friendlyError(error:unknown){
 if(!(error instanceof ApiError))return 'אירעה שגיאה. נסו שוב.';
 if(error.status===400)return 'בדקו שכל הפרטים תקינים. בהרשמה נדרשת סיסמה של 12 תווים לפחות עם אות גדולה, אות קטנה, מספר וסימן.';
 if(error.status===401)return 'האימייל או הסיסמה אינם נכונים.';
 if(error.status===409)return 'כתובת האימייל כבר רשומה.';
 if(error.status===429)return 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.';
 return 'לא הצלחנו להתחבר כעת. נסו שוב מאוחר יותר.';
}

export default function LoginPage(){
 const[register,setRegister]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false),[password,setPassword]=useState(''),router=useRouter();
 const requirements=passwordRequirements(password);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');
  const data=Object.fromEntries(new FormData(event.currentTarget));
  if(register){
   const validation=passwordValidationMessage(String(data.password??''));
   if(validation){setError(validation);return}
   if(data.password!==data.confirmPassword){setError('הסיסמאות אינן תואמות.');return}
  }
  delete data.confirmPassword;setLoading(true);
  try{
   const result=await api.post<Session>(register?'/auth/register':'/auth/login',data);
   localStorage.setItem('shuk-token',result.accessToken);window.dispatchEvent(new Event('shuk-auth-change'));
   const roles=result.user.roles;
   router.push(roles.includes('SUPER_ADMIN')||roles.includes('ADMIN')?'/admin':roles.includes('SELLER')?'/seller-dashboard':'/account');router.refresh();
  }catch(caught){setError(friendlyError(caught))}finally{setLoading(false)}
 }
 return <main dir="rtl"><Header/><form className="authForm" onSubmit={submit}><h1>{register?'פתיחת חשבון':'התחברות'}</h1>{register&&<><input name="firstName" maxLength={80} placeholder="שם פרטי" aria-label="שם פרטי" required/><input name="lastName" maxLength={80} placeholder="שם משפחה" aria-label="שם משפחה" required/></>}<input type="email" name="email" maxLength={254} placeholder="אימייל" aria-label="אימייל" autoComplete="email" required/><input type="password" name="password" minLength={register?PASSWORD_MIN_LENGTH:1} maxLength={PASSWORD_MAX_LENGTH} placeholder="סיסמה" aria-label="סיסמה" aria-describedby={register?'password-requirements':undefined} autoComplete={register?'new-password':'current-password'} value={password} onChange={event=>setPassword(event.target.value)} required/>{register&&<><input type="password" name="confirmPassword" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} placeholder="אימות סיסמה" aria-label="אימות סיסמה" autoComplete="new-password" required/><ul id="password-requirements" className="passwordRequirements" aria-label="דרישות סיסמה"><li data-valid={requirements.length}>12–128 תווים</li><li data-valid={requirements.lowercase}>אות אנגלית קטנה</li><li data-valid={requirements.uppercase}>אות אנגלית גדולה</li><li data-valid={requirements.number}>מספר</li><li data-valid={requirements.symbol}>סימן מיוחד</li></ul></>}{!register&&<Link className="forgotLink" href="/forgot-password">שכחתם את הסיסמה?</Link>}{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={loading}>{loading?'נא להמתין…':register?'הרשמה':'כניסה'}</button><button type="button" className="linkButton" onClick={()=>{setRegister(!register);setError('');setPassword('')}}>{register?'כבר יש לי חשבון':'עדיין אין לי חשבון'}</button></form></main>;
}
