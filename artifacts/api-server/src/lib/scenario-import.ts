import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GetSahmiScenarioResponse } from "@workspace/api-zod";

const sources = [
  { symbol: "SPY", fileName: "attached_assets/2_spy_1792341686871.csv", key: "stockFund", label: "صندوق أسهم" },
  { symbol: "AGG", fileName: "attached_assets/0_agg_1792341686870.csv", key: "bondFund", label: "صندوق سندات" },
  { symbol: "GLD", fileName: "attached_assets/1_gld_1792341686871.csv", key: "gold", label: "ذهب" },
] as const;

const expectedMonths = Array.from({ length: 13 }, (_,index) =>
  index === 12 ? "2021-01" : `2020-${String(index + 1).padStart(2, "0")}`,
);

export function parsePriceCsv(contents: string, symbol: string) {
  const [header, ...lines] = contents.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (header !== "month,adjusted_close,close" || lines.length !== 13) {
    throw new Error(`${symbol}: expected the supplied header and exactly 13 rows`);
  }
  return lines.map((line, index) => {
    const fields = line.split(",");
    const [month, adjusted, actual] = fields;
    if (fields.length !== 3 || month !== expectedMonths[index]) {
      throw new Error(`${symbol}: missing, duplicated, unordered, or invalid month at row ${index + 1}`);
    }
    if (!/^\d+(?:\.\d+)?$/.test(adjusted ?? "") || !/^\d+(?:\.\d+)?$/.test(actual ?? "")) {
      throw new Error(`${symbol}: invalid numeric price at ${month}`);
    }
    const adjusted_close = Number(adjusted);
    const close = Number(actual);
    if (![adjusted_close, close].every(value => Number.isFinite(value) && value > 0)) {
      throw new Error(`${symbol}: price must be finite and positive at ${month}`);
    }
    if (symbol === "GLD" && adjusted_close !== close) {
      throw new Error("GLD: columns differ; stop and confirm the uploaded source");
    }
    return { month, adjusted_close, close };
  });
}

/** Server-side importer only. The running API never imports this data as a fallback. */
export async function readSuppliedScenario() {
  const root = new URL("../../../../", import.meta.url);
  const importSources = await Promise.all(sources.map(async source => {
    const contents = await readFile(fileURLToPath(new URL(source.fileName, root)), "utf8");
    return {
      ...source,
      sourceUrl: `https://www.digrin.com/stocks/detail/${source.symbol}/price`,
      sha256: createHash("sha256").update(contents).digest("hex"),
      rows: parsePriceCsv(contents, source.symbol),
    };
  }));
  const [stock, bonds, gold] = importSources;
  if (!stock || !bonds || !gold) throw new Error("Missing historical series");

  const data = GetSahmiScenarioResponse.parse({
    scenarioId: "sahmi-2020",
    title: "فهد وأول ألف دينار",
    periodLabel: "يناير ٢٠٢٠ — يناير ٢٠٢١",
    player: {
      name: "فهد",
      age: 22,
      startingSavingsKd: 1000,
      goal: "يشتري سيارة بعد سنتين",
      goalMonths: 24,
    },
    assets: [
      ...importSources.map(source => ({
        id: source.key, label: source.label, symbol: source.symbol, source: source.sourceUrl,
      })),
      { id: "cash", label: "كاش", symbol: null, source: "افتراض اللعبة: الكاش ثابت، بدون فوايد." },
    ],
    monthlyPrices: expectedMonths.map((month, index) => ({
      month,
      stockFund: stock.rows[index]!.adjusted_close,
      bondFund: bonds.rows[index]!.adjusted_close,
      gold: gold.rows[index]!.adjusted_close,
      cash: 1,
    })),
    events: [
      {
        id: "market-drop", month: "2020-03", type: "marketDrop",
        title: "السوق نزل… شتسوي؟",
        description: "أسعار الأسهم نزلت مع بداية كورونا. فهد محتار: ينطر، يبيع جزء، ولا يشتري زيادة؟",
        amountKd: null,
      },
      {
        id: "surprise-expense", month: "2020-06", type: "surpriseExpense",
        title: "طلعت مصاريف مو بالحسبان",
        description: "فهد يحتاج ٣٠٠ دينار الحين. من وين يطلعهم؟ هالموقف جزء من قصة اللعبة، مو حدث تاريخي.",
        amountKd: 300,
      },
    ],
    decisionExplanations: [
      {
        decision: 1, title: "قسّم الألف دينار",
        text: "لا تحط فلوسك كلها بمكان واحد. إذا نوع نزل، الأنواع الثانية ممكن تخفف النزلة. والكاش يخليك جاهز للمصاريف.",
      },
      {
        decision: 2, title: "خذ نفس وقت النزلة",
        text: "النزلة تخوّف، بس لا تخلي الخوف يقرر عنك. راجع هدف فهد والفلوس اللي يحتاجها قبل لا تبيع أو تشتري زيادة.",
      },
      {
        decision: 3, title: "جهّز للمفاجآت",
        text: "الكاش الاحتياطي يساعد فهد يدفع مصاريفه بدون ما يضطر يبيع استثماراته بوقت مو مناسب.",
      },
    ],
    disclaimer: "هذي لعبة للتعلّم، مو نصيحة استثمارية. كل الفلوس وهمية، وما فيها شراء أو بيع بفلوس حقيقية.",
    dataInfo: {
      sourceName: "Digrin",
      retrievedOn: "2026-10-18",
      priceCurrency: "USD",
      pricingNote: "الجدول يعرض أسعار شهرية بالدولار تشمل أثر التوزيعات. نستخدم نسبة التغيّر بين الأشهر على فلوس فهد الوهمية بالدينار، بدون حساب تغيّر سعر صرف العملات. الكاش ثابت وبدون فوايد.",
      limitations: "البيانات من مصدر واحد زوّدنا فيه صاحب المشروع. SPY وGLD ما تقارنوا بمصدر ثاني، والأرقام شهرية مو أسعار مباشرة.",
    },
  });
  return { data, importSources };
}
