import { Link } from 'wouter';

export default function NotFound() {
  return (
    <main dir="rtl" className="min-h-[100dvh] w-full flex items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <p className="num text-6xl font-medium text-primary/30">404</p>
        <h1 className="font-display mt-4 text-2xl font-bold">الصفحة مو موجودة</h1>
        <p className="mt-2 text-muted-foreground">يمكن الرابط غلط أو الصفحة انشالت. ارجع للرئيسية وكمّل مع فهد.</p>
        <Link href="/" data-testid="link-home" className="mt-6 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
          الرجوع للرئيسية
        </Link>
      </div>
    </main>
  );
}
