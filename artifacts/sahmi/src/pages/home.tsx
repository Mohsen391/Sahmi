import { getGetSahmiScenarioQueryKey, useGetSahmiScenario, type SahmiScenario, type ScenarioAssetId } from '@workspace/api-client-react';
import { ChevronDown, ExternalLink, RotateCw, TriangleAlert, Database } from 'lucide-react';
import { ServiceStatus } from '@/components/service-status';

const SCENARIO_ID = 'sahmi-2020';
const PRICED: Exclude<ScenarioAssetId, 'cash'>[] = ['stockFund', 'bondFund', 'gold'];
const ORDINALS = ['الأول', 'الثاني', 'الثالث'];

const kd = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n);
const usd = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-6">
        <span className="font-display text-xl font-bold text-primary">سهمي</span>
        <ServiceStatus />
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-8">{children}</main>
    </div>
  );
}

function Section({ title, kicker, children, delay = 0 }: { title: string; kicker?: string; children: React.ReactNode; delay?: number }) {
  return (
    <section className="rise mt-12" style={{ animationDelay: `${delay}ms` }}>
      {kicker && <p className="text-xs font-semibold tracking-wide text-accent-foreground/70">{kicker}</p>}
      <h2 className="font-display mt-1 text-xl font-bold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="جاري تحميل السيناريو" data-testid="state-loading" className="animate-pulse space-y-4">
      <div className="h-4 w-24 rounded bg-muted" />
      <div className="h-10 w-3/4 rounded bg-muted" />
      <div className="h-32 rounded-xl bg-muted" />
      <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted" />)}</div>
      <div className="h-40 rounded-xl bg-muted" />
    </div>
  );
}

function Problem({ title, body, onRetry, retrying }: { title: string; body: string; onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert" data-testid="state-error" className="rounded-xl border border-destructive/30 bg-card p-6">
      <TriangleAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
      <h1 className="font-display mt-3 text-xl font-bold">{title}</h1>
      <p className="mt-2 text-muted-foreground">{body}</p>
      <button type="button" onClick={onRetry} disabled={retrying} data-testid="button-retry"
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
        <RotateCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
        {retrying ? 'جاري المحاولة...' : 'حاول مرة ثانية'}
      </button>
    </div>
  );
}

function ScenarioView({ s }: { s: SahmiScenario }) {
  const assetMap = new Map(s.assets.map((a) => [a.id, a]));
  const cash = assetMap.get('cash');
  const priced = PRICED.map((id) => assetMap.get(id)).filter((a): a is NonNullable<typeof a> => !!a);
  const decisions = [...s.decisionExplanations].sort((a, b) => a.decision - b.decision).slice(0, 3);
  const first = s.monthlyPrices[0]?.month;
  const last = s.monthlyPrices[s.monthlyPrices.length - 1]?.month;

  return (
    <article data-testid="scenario">
      <div className="rise">
        <p className="inline-block rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">معاينة السيناريو · اللعب جاي قريب</p>
        <h1 data-testid="text-title" className="font-display mt-4 text-3xl font-bold leading-tight sm:text-4xl">{s.title}</h1>
        <p data-testid="text-period" className="mt-2 text-muted-foreground">الفترة: {s.periodLabel}</p>
      </div>

      <div className="rise mt-8 overflow-hidden rounded-2xl bg-primary text-primary-foreground" style={{ animationDelay: '80ms' }} data-testid="card-player">
        <div className="p-6">
          <p className="text-sm opacity-75">بطل القصة</p>
          <p className="font-display mt-1 text-2xl font-bold">{s.player.name}، عمره {s.player.age} سنة</p>
          <p className="mt-3 leading-relaxed opacity-90">هدفه: {s.player.goal} خلال {s.player.goalMonths} شهر.</p>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-primary-foreground/15 bg-black/10 px-6 py-4">
          <span className="text-sm opacity-80">مدّخراته (فلوس وهمية)</span>
          <span><span className="num text-2xl font-medium">{kd(s.player.startingSavingsKd)}</span> <span className="text-sm">د.ك</span></span>
        </div>
      </div>

      <Section title="وين ممكن يحط فلوسه؟" kicker="أربعة خيارات" delay={140}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {s.assets.map((a) => (
            <li key={a.id} data-testid={`card-asset-${a.id}`} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{a.label}</p>
                {a.symbol && <span className="num rounded bg-muted px-2 py-0.5 text-xs">{a.symbol}</span>}
              </div>
              <p className="mt-2 text-xs text-muted-foreground break-words">{a.id === 'cash' ? 'كاش ثابت بدون سعر تاريخي' : 'المصدر:'} {a.source.startsWith('http') ? (
                <a href={a.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2" data-testid={`link-source-${a.id}`}>
                  {s.dataInfo.sourceName}<ExternalLink className="h-3 w-3" aria-hidden="true" /><span className="sr-only">(يفتح في نافذة جديدة)</span>
                </a>) : <span>{a.source}</span>}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="القرارات الثلاثة اللي بتواجهها" kicker="شنو بيصير بعدين" delay={200}>
        <ol className="space-y-3">
          {decisions.map((d, i) => (
            <li key={d.decision} data-testid={`card-decision-${d.decision}`} className="flex gap-4 rounded-xl border bg-card p-4">
              <span className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-foreground">{d.decision}</span>
              <div>
                <p className="text-xs text-muted-foreground">القرار {ORDINALS[i]}</p>
                <p className="font-semibold">{d.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{d.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="الأسعار التاريخية الحقيقية" kicker={`${s.monthlyPrices.length} شهر`} delay={260}>
        <details className="group rounded-xl border bg-card" data-testid="disclosure-prices">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-medium focus-visible:outline-2 focus-visible:outline-ring">
            <span>اعرض جدول الأسعار الشهرية (بالدولار الأمريكي)</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t p-4">
            <p className="mb-3 text-sm text-muted-foreground">سعر الوحدة المعدّل بالـ {s.dataInfo.priceCurrency}، مو بالدينار. من <span className="num">{first}</span> إلى <span className="num">{last}</span>.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-prices">
                <caption className="sr-only">أسعار شهرية معدّلة بالـ {s.dataInfo.priceCurrency} لكل وحدة</caption>
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="py-2 text-start font-medium">الشهر</th>
                    {priced.map((a) => <th key={a.id} scope="col" className="py-2 text-end font-medium">{a.label}{a.symbol && <span className="num block text-xs">{a.symbol}</span>}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {s.monthlyPrices.map((m) => (
                    <tr key={m.month} className="border-b border-border/60 last:border-0" data-testid={`row-price-${m.month}`}>
                      <th scope="row" className="num py-2 text-start font-normal">{m.month}</th>
                      {priced.map((a) => <td key={a.id} className="num py-2 text-end">{usd(m[a.id])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cash && (
              <p className="mt-4 rounded-lg bg-muted p-3 text-sm" data-testid="text-cash-note">
                <strong>{cash.label}:</strong> قيمته ثابتة طول الفترة (<span className="num">1</span>). هذا مو سعر تاريخي، بس كاش وهمي ما يزيد ولا ينقص اسمياً.
              </p>
            )}
          </div>
        </details>
      </Section>

      <Section title="من وين البيانات؟" kicker="شفافية" delay={320}>
        <div className="rounded-xl border bg-card p-5 text-sm leading-relaxed" data-testid="card-data-info">
          <div className="flex items-center gap-2 font-semibold"><Database className="h-4 w-4 text-primary" aria-hidden="true" />{s.dataInfo.sourceName}</div>
          <dl className="mt-3 space-y-3">
            <div><dt className="text-muted-foreground">تاريخ السحب</dt><dd className="num text-start">{s.dataInfo.retrievedOn}</dd></div>
            <div><dt className="text-muted-foreground">عملة الأسعار</dt><dd>{s.dataInfo.priceCurrency}</dd></div>
            <div><dt className="text-muted-foreground">طريقة الحساب</dt><dd>{s.dataInfo.pricingNote}</dd></div>
            <div><dt className="text-muted-foreground">حدود البيانات</dt><dd>{s.dataInfo.limitations}</dd></div>
          </dl>
        </div>
        <p className="mt-4 border-s-4 border-accent ps-4 text-sm text-muted-foreground" data-testid="text-disclaimer">{s.disclaimer}</p>
      </Section>
    </article>
  );
}

export default function Home() {
  const { data, isLoading, isError, error, refetch, isFetching } = useGetSahmiScenario(SCENARIO_ID, {
    query: { queryKey: getGetSahmiScenarioQueryKey(SCENARIO_ID), retry: false },
  });
  const retry = () => { void refetch(); };

  let body: React.ReactNode;
  if (isLoading) body = <Skeleton />;
  else if (isError) {
    const msg = (error as { data?: { error?: string } } | null)?.data?.error;
    body = <Problem title="ما قدرنا نجيب السيناريو" body={msg ? `السبب: ${msg}` : 'صار خلل بالاتصال مع الخادم. تأكد من النت وحاول مرة ثانية.'} onRetry={retry} retrying={isFetching} />;
  } else if (!data || !data.monthlyPrices?.length || !data.assets?.length) {
    body = <Problem title="السيناريو فاضي" body="ما لقينا بيانات محفوظة لهالسيناريو بعد. يمكن البيانات للحين ما انضافت." onRetry={retry} retrying={isFetching} />;
  } else body = <ScenarioView s={data} />;

  return <Shell>{body}</Shell>;
}
