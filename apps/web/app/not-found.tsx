import Link from 'next/link';
import {Footer,Header} from '../components/site-shell';
export default function NotFound(){return <main dir="rtl"><Header/><section className="customerError globalErrorPage"><span>404</span><h1>העמוד לא נמצא</h1><p>ייתכן שהקישור השתנה או שהעמוד אינו זמין יותר.</p><Link className="primary" href="/">חזרה לחנות</Link></section><Footer/></main>}
