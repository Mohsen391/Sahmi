import {
  GetSahmiScenarioResponse, SubmitSahmiDecisionBody, GetSahmiGameResponse,
} from "@workspace/api-zod";
export type ScenarioData = ReturnType<typeof GetSahmiScenarioResponse.parse>;
export type DecisionInput = ReturnType<typeof SubmitSahmiDecisionBody.parse>;
export type GameState = ReturnType<typeof GetSahmiGameResponse.parse>;
export type Amounts = GameState["balances"];
export type AssetId = keyof Amounts;
export const assetIds: AssetId[] = ["stockFund", "bondFund", "gold", "cash"];
export const emptyAmounts = (): Amounts => ({ stockFund: 0, bondFund: 0, gold: 0, cash: 0 });
export type SessionData = {
  version: number;
  nextDecision: number;
  units: Amounts;
  expensePaidKd: number;
  decisions: Array<GameState["decisions"][number] & { input: DecisionInput }>;
};

export class GameError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// Transactions have KD/fils precision. Holdings retain full precision between
// supplied observations; there are no fabricated intermediate market prices.
const fils = (n: number) => Math.floor(n * 1000 + 1e-7);
const sum = (a: Amounts) => assetIds.reduce((total, id) => total + Math.round(a[id] * 1000), 0) / 1000;
const validMoney = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1_000_000
  && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-7;

export function copy(s: ScenarioData, key: string): string {
  const text = s.gameTexts[key];
  if (!text) throw new Error("Required approved scenario wording is missing");
  return text;
}

function event(s: ScenarioData, type: "marketDrop" | "surpriseExpense") {
  const found = s.events.find(e => e.type === type);
  if (!found) throw new Error("Required stored event is missing");
  return found;
}

export function gameMonth(s: ScenarioData, step: number) {
  const month = step === 1 ? s.monthlyPrices[0]?.month
    : step === 2 ? event(s, "marketDrop").month : event(s, "surpriseExpense").month;
  if (!month) throw new Error("Missing historical observation");
  return month;
}

function prices(s: ScenarioData, month: string) {
  const row = s.monthlyPrices.find(p => p.month === month);
  if (!row || assetIds.some(id => !Number.isFinite(row[id]) || row[id] <= 0) || row.cash !== 1) {
    throw new Error("Stored price unavailable; do not estimate");
  }
  return row;
}

function balancesAt(s: ScenarioData, units: Amounts, month: string): Amounts {
  const row = prices(s, month);
  return Object.fromEntries(assetIds.map(id => [id, fils(units[id] * row[id]) / 1000])) as Amounts;
}

export function publicGame(s: ScenarioData, game: SessionData): GameState {
  const month = gameMonth(s, game.nextDecision);
  const balances = balancesAt(s, game.units, month);
  return GetSahmiGameResponse.parse({
    version: game.version, nextDecision: game.nextDecision, month,
    balances, totalKd: sum(balances), startingSavingsKd: s.player.startingSavingsKd,
    expensePaidKd: game.expensePaidKd, decisions: game.decisions,
    buyDisabledReason: balances.cash < 0.001 ? copy(s, "buyDisabled") : null,
  });
}

export function applyDecision(s: ScenarioData, current: SessionData, input: DecisionInput): SessionData {
  if (input.version !== current.version || input.decision !== current.nextDecision) {
    throw new GameError("هالقرار تغيّر أو انحفظ من قبل. حدّث الصفحة وشوف آخر حالة.", 409);
  }
  const month = gameMonth(s, current.nextDecision);
  const row = prices(s, month);
  const game: SessionData = {
    ...current, units: { ...current.units }, decisions: [...current.decisions],
    version: current.version + 1, nextDecision: current.nextDecision + 1,
  };
  let key: string;
  let choice: string;
  const allocationMessage = input.decision === 1 ? "invalidAllocation" : "invalidExpense";
  if (input.decision === 1 || input.decision === 3) {
    const amounts = input.amounts;
    if (!amounts || input.action !== undefined || input.asset !== undefined || input.amountKd !== undefined
      || assetIds.some(id => !validMoney(amounts[id]))) {
      throw new GameError(copy(s, allocationMessage));
    }
    const expense = event(s, "surpriseExpense").amountKd;
    if (expense === null || !validMoney(expense)) throw new Error("Stored expense is invalid");
    const required = input.decision === 1 ? s.player.startingSavingsKd : expense;
    if (assetIds.reduce((n, id) => n + Math.round(amounts[id] * 1000), 0) !== Math.round(required * 1000)) {
      throw new GameError(copy(s, allocationMessage));
    }
    if (input.decision === 1) {
      for (const id of assetIds) game.units[id] = amounts[id] / row[id];
      const positive = assetIds.filter(id => amounts[id] > 0);
      key = positive.length === 1 ? "allocationSingle" : amounts.cash === 0 ? "allocationNoCash" : "allocationCash";
      choice = "allocation";
    } else {
      const available = balancesAt(s, current.units, month);
      for (const id of assetIds) {
        if (Math.round(amounts[id] * 1000) > fils(available[id])) {
          throw new GameError(`${s.assets.find(a => a.id === id)!.label}: ${copy(s, "insufficientExpense")}`);
        }
        game.units[id] = Math.max(0, game.units[id] - amounts[id] / row[id]);
      }
      game.expensePaidKd = expense;
      key = amounts.cash === required ? "expenseCash" : amounts.cash === 0 ? "expenseSale" : "expenseMixed";
      choice = key;
    }
  } else {
    if (input.amounts !== undefined || !input.action) throw new GameError("الطلب مو صحيح.");
    key = choice = input.action;
    if (input.action === "hold") {
      if (input.asset !== undefined || input.amountKd !== undefined) throw new GameError("الطلب مو صحيح.");
    } else {
      if (!input.asset || input.amountKd === undefined || !validMoney(input.amountKd) || input.amountKd <= 0) {
        throw new GameError("اختار الاستثمار ودخّل مبلغ أكبر من 0، بحد أقصى 3 أرقام بعد الفاصلة.");
      }
      const amount = input.amountKd;
      const available = balancesAt(s, current.units, month);
      if (input.action === "buy") {
        if (available.cash < 0.001) throw new GameError(copy(s, "buyDisabled"));
        if (Math.round(amount * 1000) > fils(available.cash)) throw new GameError(copy(s, "insufficientCash"));
        game.units.cash = Math.max(0, game.units.cash - amount);
        game.units[input.asset] += amount / row[input.asset];
      } else {
        if (Math.round(amount * 1000) > fils(available[input.asset])) throw new GameError(copy(s, "insufficientAsset"));
        game.units[input.asset] = Math.max(0, game.units[input.asset] - amount / row[input.asset]);
        game.units.cash += amount;
      }
    }
  }
  const balances = balancesAt(s, game.units, month);
  game.decisions.push({
    decision: input.decision, month, choice, input,
    explanation: copy(s, key), balances, totalKd: sum(balances),
  });
  return game;
}
