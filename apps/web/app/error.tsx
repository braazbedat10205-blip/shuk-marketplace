'use client';
import Link from 'next/link';
import {useEffect} from 'react';
export default function GlobalError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){useEffect(()=>{if(process.env.NODE_ENV!=='production')console.error(error)},[error]);return <main dir="rtl"><section className="customerError globalErrorPage"><span>!</span><h1>משהו השתבש</h1><p>לא הצלחנו להציג את העמוד. אפשר לנסות שוב בלי לאבד את הסל.</p><div><button className="primary" onClick={reset}>נסו שוב</button><Link className="ghost" href="/">חזרה לחנות</Link></div></section></main>}
