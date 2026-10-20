import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  getGetSahmiGameQueryKey, useGetSahmiGame, useStartSahmiGame, useSubmitSahmiDecision,
  type AssetAmounts, type GameDecisionInput, type GameState, type SahmiScenario,
} from '@workspace/api-client-react';
import { Play, RotateCcw, TriangleAlert } from 'lucide-react';

type AssetId = keyof AssetAmounts;
type TradeAsset = Exclude<AssetId, 'cash'>;
const IDS: AssetId[] = ['stockFund', 'bondFund', 'gold', 'cash'];
const TRADE: TradeAsset[] = ['stockFund', 'bondFund', 'gold'];
const kd = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n);

type Err = { status?: number; data?: { error?: string } | null } | null;
const errStatus = (e: unknown) => (e as Err)?.status;
function errText(e: unknown): string {
  const er = e as Err;
  if (er?.data?.error) return er.data.error;
  if (er?.status === 409) return 'حالة اللعبة تغيّرت. جبنا لك آخر نسخة، راجعها وحاول مرة ثانية.';
  if (er?.status) return `الخادم رفض الطلب (رمز ${er.status}).`;
  return 'صار خلل بالاتصال مع الخادم. تأكد من النت وحاول مرة ثانية.';
}

function ErrorBox({ e, id }: { e: unknown; id: string }) {
  if (!e) return null;
  return (
    <p role="alert" data-testid={id} className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{errText(e)}
    </p>
  );
}

const btn = 'inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60';

function Balances({ b, total, month, labels, testid }: { b: AssetAmounts; total: number; month: string; labels: Record<string, string>; testid: string }) {
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={testid}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">الأرصدة في شهر <span className="num">{month}</span></p>
        <p><span className="num text-xl font-medium" data-testid={`${testid}-total`}>{kd(total)}</span> <span className="text-sm">د.ك</span></p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {IDS.map((id) => (
          <div key={id} className="rounded-lg bg-muted px-3 py-2">
            <dt className="text-xs text-muted-foreground">{labels[id] ?? id}</dt>
            <dd className="num font-medium" data-testid={`${testid}-${id}`}>{kd(b[id])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AmountFields({ prefix, values, set, labels }: { prefix: string; values: Record<AssetId, string>; set: (v: Record<AssetId, string>) => void; labels: Record<string, string> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {IDS.map((id) => (
        <label key={id} className="block rounded-lg border bg-background p-3">
          <span className="text-sm font-medium">{labels[id] ?? id} <span className="text-xs text-muted-foreground">(د.ك)</span></span>
          <input type="number" inputMode="decimal" step="0.001" min="0" dir="ltr" required
            data-testid={`${prefix}-${id}`} value={values[id]}
            onChange={(e) => set({ ...values, [id]: e.target.value })}
            className="num mt-2 w-full rounded-md border bg-card px-3 py-2 text-start focus-visible:outline-2 focus-visible:outline-ring" />
        </label>
      ))}
    </div>
  );
}

const zeros = (): Record<AssetId, string> => ({ stockFund: '0', bondFund: '0', gold: '0', cash: '0' });
const toAmounts = (v: Record<AssetId, string>): AssetAmounts => ({
  stockFund: Number(v.stockFund), bondFund: Number(v.bondFund), gold: Number(v.gold), cash: Number(v.cash),
});

export function Game({ s }: { s: SahmiScenario }) {
  const qc = useQueryClient();
  const key = getGetSahmiGameQueryKey();
  const labels = Object.fromEntries(s.assets.map((a) => [a.id, a.label])) as Record<string, string>;
  const game = useGetSahmiGame({ query: { queryKey: key, retry: false, refetchOnMount: 'always' } });
  const [alloc, setAlloc] = useState(zeros);
  const [expense, setExpense] = useState(zeros);
  const [action, setAction] = useState<'hold' | 'sell' | 'buy'>('hold');
  const [asset, setAsset] = useState<TradeAsset>('stockFund');
  const [amountKd, setAmountKd] = useState('0');
  const [confirmRestart, setConfirmRestart] = useState(false);

  const onState = (st: GameState) => { qc.setQueryData(key, st); };
  const start = useStartSahmiGame({ mutation: { onSuccess: (st) => {
    onState(st); setAlloc(zeros()); setExpense(zeros()); setAction('hold'); setAmountKd('0'); setConfirmRestart(false);
  } } });
  const submit = useSubmitSahmiDecision({ mutation: {
    onSuccess: onState,
    onError: (e) => { if (errStatus(e) === 409) void game.refetch(); },
  } });
  const pending = start.isPending || submit.isPending;

  const send = (data: GameDecisionInput) => { start.reset(); submit.reset(); submit.mutate({ data }); };
  const doStart = () => { submit.reset(); start.reset(); start.mutate(); };

  const wrap = (children: React.ReactNode) => (
    <section className="rise mt-12" data-testid="game">
      <p className="text-xs font-semibold tracking-wide text-accent-foreground/70">العب القصة</p>
      <h2 className="font-display mt-1 text-xl font-bold">قرارات فهد</h2>
      <div className="mt-4">{children}</div>
    </section>
  );

  if (game.isLoading) return wrap(<div aria-busy="true" data-testid="game-loading" className="h-40 animate-pulse rounded-xl bg-muted" />);

  const st = game.data;
  const noGame = !st && (errStatus(game.error) === 404 || !game.isError);
  if (game.isError && !noGame && !st) {
    return wrap(
      <div className="rounded-xl border border-destructive/30 bg-card p-5" data-testid="error-game">
        <p className="font-semibold">ما قدرنا نجيب حالة اللعبة</p>
        <ErrorBox e={game.error} id="error-game-load" />
        <button type="button" className={`${btn} mt-4`} onClick={() => void game.refetch()} disabled={game.isFetching} data-testid="button-retry-game">حاول مرة ثانية</button>
      </div>,
    );
  }

  if (!st) {
    return wrap(
      <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-card p-6 text-center">
        <p className="font-display text-lg font-bold">جاهز تساعد فهد؟</p>
        <p className="mt-2 text-sm text-muted-foreground">ثلاث قرارات، بأسعار تاريخية حقيقية وفلوس وهمية. تقدر تعيد من الأول متى ما تبي.</p>
        <button type="button" className={`${btn} mt-5`} onClick={doStart} disabled={pending} data-testid="start-game">
          <Play className="h-4 w-4" aria-hidden="true" />{start.isPending ? 'جاري البدء...' : 'ابدأ اللعبة'}
        </button>
        <ErrorBox e={start.error} id="error-start" />
      </div>,
    );
  }

  const step = st.nextDecision;
  const expl = (n: number) => s.decisionExplanations.find((d) => d.decision === n);

  const restart = (
    <div className="mt-8 rounded-xl bg-muted p-4 text-sm">
      {!confirmRestart ? (
        <button type="button" onClick={() => setConfirmRestart(true)} disabled={pending} data-testid="restart-game"
          className="inline-flex items-center gap-2 font-medium text-primary underline underline-offset-4 disabled:opacity-60">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />ابدأ من جديد
        </button>
      ) : (
        <div data-testid="restart-confirm">
          <p>متأكد؟ بيروح كل التقدم الحالي وتبدأ من أول قرار.</p>
          <div className="mt-3 flex gap-3">
            <button type="button" className={btn} onClick={doStart} disabled={pending} data-testid="restart-confirm-yes">{start.isPending ? 'جاري...' : 'إي، ابدأ من جديد'}</button>
            <button type="button" className="rounded-md border px-4 py-2" onClick={() => setConfirmRestart(false)} disabled={pending} data-testid="restart-confirm-no">لا، كمّل</button>
          </div>
        </div>
      )}
      <ErrorBox e={start.error} id="error-restart" />
    </div>
  );

  let form: React.ReactNode = null;
  if (step === 1) {
    form = (
      <form onSubmit={(e) => { e.preventDefault(); send({ decision: 1, version: st.version, amounts: toAmounts(alloc) }); }}>
        <AmountFields prefix="allocation" values={alloc} set={setAlloc} labels={labels} />
        <button type="submit" className={`${btn} mt-4`} disabled={pending} data-testid="submit-allocation">{submit.isPending ? 'جاري الإرسال...' : 'ثبّت التوزيع'}</button>
      </form>
    );
  } else if (step === 2) {
    form = (
      <form onSubmit={(e) => {
        e.preventDefault();
        send(action === 'hold' ? { decision: 2, version: st.version, action } : { decision: 2, version: st.version, action, asset, amountKd: Number(amountKd) });
      }}>
        <div role="radiogroup" aria-label="شنو تسوي؟" className="grid grid-cols-3 gap-2">
          {([['hold', 'اصبر'], ['sell', 'بيع'], ['buy', 'اشتر']] as const).map(([a, t]) => {
            const dis = a === 'buy' && !!st.buyDisabledReason;
            return (
              <button key={a} type="button" role="radio" aria-checked={action === a} disabled={dis || pending}
                onClick={() => { setAction(a); submit.reset(); }} data-testid={`action-${a}`}
                className={`rounded-lg border px-3 py-3 text-sm font-medium disabled:opacity-50 ${action === a ? 'border-primary bg-primary text-primary-foreground' : 'bg-background'}`}>{t}</button>
            );
          })}
        </div>
        {st.buyDisabledReason && <p className="mt-2 text-xs text-muted-foreground" data-testid="text-buy-disabled">الشراء مقفل: {st.buyDisabledReason}</p>}
        {action !== 'hold' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">أي خيار؟
              <select value={asset} onChange={(e) => setAsset(e.target.value as TradeAsset)} data-testid="trade-asset"
                className="mt-2 w-full rounded-md border bg-card px-3 py-2">
                {TRADE.map((id) => <option key={id} value={id}>{labels[id] ?? id}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">المبلغ (د.ك)
              <input type="number" inputMode="decimal" step="0.001" min="0" dir="ltr" required value={amountKd}
                onChange={(e) => setAmountKd(e.target.value)} data-testid="trade-amount"
                className="num mt-2 w-full rounded-md border bg-card px-3 py-2 text-start" />
            </label>
          </div>
        )}
        <button type="submit" className={`${btn} mt-4`} disabled={pending} data-testid="submit-market">{submit.isPending ? 'جاري الإرسال...' : 'ثبّت القرار'}</button>
      </form>
    );
  } else if (step === 3) {
    form = (
      <form onSubmit={(e) => { e.preventDefault(); send({ decision: 3, version: st.version, amounts: toAmounts(expense) }); }}>
        <p className="mb-3 text-sm text-muted-foreground">لازم يغطي <span className="num">300</span> د.ك. اكتب كم تاخذ من الكاش و/أو كم تبيع من كل خيار.</p>
        <AmountFields prefix="expense" values={expense} set={setExpense} labels={labels} />
        <button type="submit" className={`${btn} mt-4`} disabled={pending} data-testid="submit-expense">{submit.isPending ? 'جاري الإرسال...' : 'ادفع المصروف'}</button>
      </form>
    );
  }

  const current = expl(step);
  return wrap(
    <div>
      <Balances b={st.balances} total={st.totalKd} month={st.month} labels={labels} testid="balances-current" />

      {st.decisions.length > 0 && (
        <ol className="mt-6 space-y-3" data-testid="list-history">
          {[...st.decisions].sort((a, b) => a.decision - b.decision).map((d) => (
            <li key={d.decision} className="rounded-xl border bg-card p-4" data-testid={`history-${d.decision}`}>
              <div className="flex items-center gap-3">
                <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-foreground">{d.decision}</span>
                <p className="text-sm"><span className="font-semibold">{expl(d.decision)?.title ?? `القرار ${d.decision}`}</span> · <span className="num text-muted-foreground">{d.month}</span></p>
              </div>
              <p className="mt-2 text-sm"><span className="text-muted-foreground">اختيارك: </span>{d.choice}</p>
              <p className="mt-2 border-s-4 border-accent ps-3 text-sm leading-relaxed" data-testid={`history-explanation-${d.decision}`}>{d.explanation}</p>
              <p className="mt-2 text-xs text-muted-foreground">المجموع وقتها: <span className="num">{kd(d.totalKd)}</span> د.ك</p>
            </li>
          ))}
        </ol>
      )}

      {step >= 4 ? (
        <CompletionResult state={st} />
      ) : (
        <div className="mt-6 rounded-2xl border bg-card p-5" data-testid={`form-decision-${step}`}>
          <p className="text-xs text-muted-foreground">القرار <span className="num">{step}</span> من <span className="num">3</span> · <span className="num">{st.month}</span></p>
          <p className="font-display mt-1 text-lg font-bold">{current?.title}</p>
          {current?.text && <p className="mt-1 mb-4 text-sm leading-relaxed text-muted-foreground">{current.text}</p>}
          {form}
          <ErrorBox e={submit.error} id="error-submit" />
        </div>
      )}
      {restart}
    </div>,
  );
}

function CompletionResult({ state }: { state: GameState }) {
  const outcome = state.finalOutcome;
  const playback = state.monthlyPlayback;
  const ending = playback[playback.length - 1];
  const formatChange = (value: number) => `${value > 0 ? '+' : ''}${kd(value)}`;
  const rubric = outcome ? [
    { key: 'diversification', title: 'التنويع', score: outcome.diversificationScore, max: 40, text: outcome.diversificationText },
    { key: 'calm', title: 'الهدوء مع تغيّر السوق', score: outcome.calmScore, max: 30, text: outcome.calmText },
    { key: 'cash-readiness', title: 'الاستعداد للمصروف', score: outcome.cashReadinessScore, max: 30, text: outcome.cashReadinessText },
  ] : [];

  return (
    <section className="rise mt-6 space-y-4" data-testid="game-complete" aria-labelledby="completion-heading">
      <div className="overflow-hidden rounded-2xl border border-primary/15 bg-card">
        <div className="grid gap-5 bg-primary/[0.07] p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:p-6">
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border-[5px] border-primary/20 bg-card text-primary" data-testid="final-score">
            {outcome ? (
              <>
                <span className="num text-3xl font-semibold leading-none">{outcome.score}</span>
                <span className="mt-1 text-xs text-muted-foreground">من 100</span>
              </>
            ) : <span className="text-sm text-muted-foreground">—</span>}
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-primary">نتيجة قرارات فهد</p>
            <h3 id="completion-heading" className="font-display mt-1 text-xl font-bold">درجة قراراتك</h3>
            {outcome ? (
              <>
                <p className="mt-3 inline-flex rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-sm font-semibold" data-testid="final-badge-title">{outcome.badgeTitle}</p>
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground" data-testid="final-badge-text">{outcome.badgeText}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">اكتملت القرارات، لكن النتيجة غير متاحة حالياً.</p>
            )}
          </div>
        </div>

        {outcome && (
          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5" data-testid="final-rubric">
            {rubric.map((item) => (
              <article key={item.key} className="rounded-xl border bg-background p-4" data-testid={`score-${item.key}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-semibold">{item.title}</h4>
                  <p className="shrink-0 text-sm font-semibold text-primary"><span className="num">{kd(item.score)}</span> <span className="font-sans font-normal text-muted-foreground">من <span className="num">{item.max}</span></span></p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, (item.score / item.max) * 100))}%` }} />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </article>
            ))}
          </div>
        )}
      </div>

      <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-labelledby="playback-heading" data-testid="monthly-playback">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="playback-heading" className="font-display text-lg font-bold">مسار المحفظة</h3>
            {ending && <p className="mt-1 text-sm text-muted-foreground">قيمة المحفظة بنهاية الفترة</p>}
          </div>
          {ending && (
            <p className="text-end" data-testid="ending-portfolio-value">
              <span className="num text-xl font-semibold">{kd(ending.totalKd)}</span>
              <span className="ms-1 text-sm">د.ك</span>
            </p>
          )}
        </div>

        {playback.length > 0 ? (
          <div className="mt-4 h-56 w-full" dir="ltr" role="img" aria-label="مخطط شهري لقيمة المحفظة من يناير 2020 إلى يناير 2021">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={playback} margin={{ top: 8, right: 10, left: 0, bottom: 2 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="month" tickFormatter={(month: string) => month.slice(2)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis width={54} tickFormatter={(value: number) => kd(value)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(value: number) => [`${kd(value)} د.ك`, 'قيمة المحفظة']}
                  labelFormatter={(label: string) => label}
                  contentStyle={{ direction: 'rtl', borderRadius: 12, borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                />
                <Line type="monotone" dataKey="totalKd" name="قيمة المحفظة" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">لا تتوفر بيانات شهرية لعرضها.</p>
        )}
        <div className="mt-3 grid gap-3 border-t pt-4 sm:grid-cols-2">
          {outcome && (
            <div className="rounded-lg bg-muted/70 p-3" data-testid="portfolio-change">
              <p className="text-xs text-muted-foreground">التغيّر عن 1,000 د.ك بالبداية</p>
              <p className={`num mt-1 text-lg font-semibold ${outcome.portfolioChangeKd < 0 ? 'text-destructive' : 'text-primary'}`}>
                {formatChange(outcome.portfolioChangeKd)} <span className="font-sans text-sm font-normal">د.ك</span>
              </p>
            </div>
          )}
          <div className="rounded-lg border border-accent/30 bg-accent/10 p-3" data-testid="expense-paid">
            <p className="text-xs font-medium text-muted-foreground">المصروف المدفوع</p>
            <p className="num mt-1 text-lg font-semibold">{kd(state.expensePaidKd)} <span className="font-sans text-sm font-normal">د.ك</span></p>
            {outcome?.expenseNote && <p className="mt-2 text-sm leading-relaxed">{outcome.expenseNote}</p>}
          </div>
        </div>
      </section>
    </section>
  );
}
