import { test } from "node:test";
import assert from "node:assert/strict";
import { readSuppliedScenario } from "./scenario-import";
import { applyDecision, emptyAmounts, GameError, publicGame, type Amounts, type SessionData } from "./game-engine";

const { data: scenario } = await readSuppliedScenario();
const fresh = (): SessionData => ({
  version: 0, nextDecision: 1, units: { ...emptyAmounts(), cash: 1000 },
  expensePaidKd: 0, decisions: [],
});
const allocate = (stockFund: number, cash = 0, bondFund = 0, gold = 0) =>
  applyDecision(scenario, fresh(), {
    decision: 1, version: 0, amounts: { stockFund, bondFund, gold, cash },
  });
const hold = (game: SessionData) =>
  applyDecision(scenario, game, { decision: 2, version: 1, action: "hold" });
const reject = (fn: () => unknown, status = 400) =>
  assert.throws(fn, e => e instanceof GameError && e.status === status);
const floorKd = (n: number) => Math.floor(n * 1000 + 1e-7) / 1000;
const finish = (afterMarket: SessionData, amounts: Amounts) => {
  const completed = applyDecision(scenario, afterMarket, {
    decision: 3, version: afterMarket.version, amounts,
  });
  const outcome = publicGame(scenario, completed).finalOutcome;
  assert.ok(outcome);
  return outcome;
};
const assertScoreRanges = (outcome: NonNullable<ReturnType<typeof publicGame>["finalOutcome"]>) => {
  assert.ok(outcome.diversificationScore >= 0 && outcome.diversificationScore <= 40);
  assert.ok(outcome.calmScore >= 0 && outcome.calmScore <= 30);
  assert.ok(outcome.cashReadinessScore >= 0 && outcome.cashReadinessScore <= 30);
  assert.equal(outcome.score, outcome.diversificationScore + outcome.calmScore + outcome.cashReadinessScore);
  assert.ok(outcome.score >= 0 && outcome.score <= 100);
};

test("initial money is available and stock-only scenario uses exact stored March and April ratios", () => {
  assert.equal(publicGame(scenario, fresh()).totalKd, 1000);
  const march = allocate(1000);
  assert.equal(publicGame(scenario, march).month, "2020-03");
  assert.equal(publicGame(scenario, march).balances.stockFund, floorKd(1000 * 235.73 / 292.53));
  assert.equal(march.decisions[0]!.totalKd, 1000);
  assert.equal(publicGame(scenario, march).buyDisabledReason, scenario.gameTexts.buyDisabled);
  const april = hold(march);
  assert.equal(publicGame(scenario, april).month, "2020-04");
  assert.equal(publicGame(scenario, april).balances.stockFund, floorKd(1000 * 265.67 / 292.53));
  reject(() => applyDecision(scenario, april, {
    decision: 3, version: 2, amounts: { ...emptyAmounts(), cash: 300 },
  }));
  const done = applyDecision(scenario, april, {
    decision: 3, version: 2, amounts: { ...emptyAmounts(), stockFund: 300 },
  });
  const result = publicGame(scenario, done);
  assert.equal(result.nextDecision, 4);
  assert.equal(result.month, "2021-01");
  assert.equal(result.expensePaidKd, 300);
  const january = scenario.monthlyPrices.find(row => row.month === "2020-01")!;
  const aprilRow = scenario.monthlyPrices.find(row => row.month === "2020-04")!;
  const yearEnd = scenario.monthlyPrices.find(row => row.month === "2021-01")!;
  assert.equal(result.decisions[2]!.balances.stockFund, floorKd(1000 * aprilRow.stockFund / january.stockFund - 300));
  assert.equal(result.balances.stockFund, floorKd((1000 / january.stockFund - 300 / aprilRow.stockFund) * yearEnd.stockFund));
  assert.equal(result.decisions[2]!.explanation, scenario.gameTexts.expenseSale);
  assert.equal(result.decisions.length, 3);
  assert.equal(result.monthlyPlayback.length, 13);
  assert.equal(result.monthlyPlayback[0]!.month, "2020-01");
  assert.equal(result.monthlyPlayback.at(-1)!.month, "2021-01");
  assert.equal(result.monthlyPlayback.at(-1)!.totalKd, result.totalKd);
  assert.equal(result.finalOutcome?.score, 43);
  assert.equal(result.finalOutcome?.portfolioChangeKd, Math.round((result.totalKd - 1000) * 1000) / 1000);
  assert.equal(result.finalOutcome?.calmScore, 30);
  assert.equal(result.finalOutcome?.cashReadinessScore, 0);
});

test("invalid allocations, precision, and decision order cannot mutate original state", () => {
  for (const amounts of [
    { stockFund: 999, cash: 0, bondFund: 0, gold: 0 },
    { stockFund: 1000.001, cash: 0, bondFund: 0, gold: 0 },
    { stockFund: 1001, cash: -1, bondFund: 0, gold: 0 },
    { stockFund: 999.9999, cash: 0.0001, bondFund: 0, gold: 0 },
    { stockFund: Infinity, cash: 0, bondFund: 0, gold: 0 },
  ]) reject(() => applyDecision(scenario, fresh(), { decision: 1, version: 0, amounts }));
  const game = allocate(1000);
  const before = JSON.stringify(game);
  reject(() => applyDecision(scenario, game, {
    decision: 2, version: 1, action: "buy", asset: "stockFund", amountKd: 1,
  }));
  reject(() => applyDecision(scenario, game, { decision: 3, version: 1, amounts: emptyAmounts() }), 409);
  reject(() => applyDecision(scenario, game, { decision: 2, version: 0, action: "hold" }), 409);
  assert.equal(JSON.stringify(game), before);
});

test("buy only spends retained cash; trade uses March's stored quote", () => {
  const game = allocate(500, 500);
  reject(() => applyDecision(scenario, game, {
    decision: 2, version: 1, action: "buy", asset: "gold", amountKd: 500.001,
  }));
  const bought = applyDecision(scenario, game, {
    decision: 2, version: 1, action: "buy", asset: "gold", amountKd: 200,
  });
  assert.equal(bought.units.cash, 300);
  assert.equal(bought.units.gold, 200 / 148.05);
  assert.equal(publicGame(scenario, bought).balances.gold, floorKd(200 * 158.8 / 148.05));
  assert.equal(bought.decisions[1]!.explanation, scenario.gameTexts.buy);
});

test("selling unavailable assets fails; sale conserves value and increases cash", () => {
  const game = allocate(1000);
  for (const [asset, amountKd] of [["gold", 1], ["stockFund", 1000]] as const) {
    reject(() => applyDecision(scenario, game, { decision: 2, version: 1, action: "sell", asset, amountKd }));
  }
  const sold = applyDecision(scenario, game, {
    decision: 2, version: 1, action: "sell", asset: "stockFund", amountKd: 300,
  });
  assert.equal(sold.units.cash, 300);
  assert.equal(sold.decisions[1]!.balances.cash, 300);
  assert.equal(sold.decisions[1]!.totalKd, publicGame(scenario, game).totalKd);
  assert.equal(sold.decisions[1]!.explanation, scenario.gameTexts.sell);
});

test("cash remains flat; cash, mixed and multi-asset expense funding are validated", () => {
  const allCash = hold(allocate(0, 1000));
  assert.equal(publicGame(scenario, allCash).totalKd, 1000);
  const paid = applyDecision(scenario, allCash, {
    decision: 3, version: 2, amounts: { ...emptyAmounts(), cash: 300 },
  });
  assert.equal(publicGame(scenario, paid).totalKd, 700);
  assert.equal(paid.decisions[2]!.explanation, scenario.gameTexts.expenseCash);
  const diversified = hold(allocate(400, 200, 200, 200));
  const mixed = applyDecision(scenario, diversified, {
    decision: 3, version: 2, amounts: { ...emptyAmounts(), stockFund: 100, cash: 200 },
  });
  assert.equal(mixed.decisions[2]!.explanation, scenario.gameTexts.expenseMixed);
  const split = applyDecision(scenario, diversified, {
    decision: 3, version: 2, amounts: { stockFund: 100, bondFund: 100, gold: 100, cash: 0 },
  });
  assert.equal(split.decisions[2]!.explanation, scenario.gameTexts.expenseSale);
  for (const cash of [299, 301]) reject(() => applyDecision(scenario, allCash, {
    decision: 3, version: 2, amounts: { ...emptyAmounts(), cash },
  }));
  reject(() => applyDecision(scenario, diversified, {
    decision: 3, version: 2, amounts: { ...emptyAmounts(), cash: 300 },
  }));
  assert.equal(diversified.decisions.length, 2);
});

test("final decision score reflects allocation, selling during the drop, and pre-expense cash—not portfolio gains", () => {
  const allocated = allocate(400, 300, 200, 100);
  const sold = applyDecision(scenario, allocated, {
    decision: 2, version: 1, action: "sell", asset: "stockFund", amountKd: 100,
  });
  const done = applyDecision(scenario, sold, {
    decision: 3, version: 2, amounts: { ...emptyAmounts(), cash: 300 },
  });
  const result = publicGame(scenario, done);
  const outcome = result.finalOutcome!;
  assert.equal(outcome.diversificationScore, 40);
  assert.ok(outcome.calmScore < 30);
  assert.equal(outcome.cashReadinessScore, 30);
  assert.equal(outcome.score, outcome.diversificationScore + outcome.calmScore + outcome.cashReadinessScore);
  assert.equal(outcome.badgeTitle, scenario.gameTexts.badgeBalancedTitle);
  assert.equal(outcome.expenseNote, scenario.gameTexts.expenseNote);

  const alteredEndPrices = structuredClone(scenario);
  const finalObservation = alteredEndPrices.monthlyPrices.at(-1)!;
  finalObservation.stockFund *= 2;
  finalObservation.bondFund *= 2;
  finalObservation.gold *= 2;
  const differentMarketValue = publicGame(alteredEndPrices, done);
  assert.notEqual(differentMarketValue.totalKd, result.totalKd);
  assert.equal(differentMarketValue.finalOutcome?.score, outcome.score);
});

test("diversification score changes at 100 KD for each investment type and stays capped", () => {
  for (const asset of ["stockFund", "bondFund", "gold"] as const) {
    for (const [amount, expectedScore] of [[99.999, 0], [100, 13], [100.001, 13]] as const) {
      const allocation = { ...emptyAmounts(), [asset]: amount, cash: 1000 - amount };
      const outcome = finish(hold(applyDecision(scenario, fresh(), {
        decision: 1, version: 0, amounts: allocation,
      })), { ...emptyAmounts(), cash: 300 });
      assert.equal(outcome.diversificationScore, expectedScore, `${asset} allocation ${amount} KD`);
      assertScoreRanges(outcome);
    }
  }

  const fullyDiversified = finish(hold(allocate(100, 700, 100, 100)), {
    ...emptyAmounts(), cash: 300,
  });
  assert.equal(fullyDiversified.diversificationScore, 40);
  assert.equal(fullyDiversified.score, 100);
  assertScoreRanges(fullyDiversified);
});

test("cash-readiness score increases below 300 KD and is capped at and above 300 KD", () => {
  const cases = [
    { initialCash: 299.999, expenseCash: 299.999, expectedScore: 29 },
    { initialCash: 300, expenseCash: 300, expectedScore: 30 },
    { initialCash: 300.001, expenseCash: 300, expectedScore: 30 },
  ];

  for (const { initialCash, expenseCash, expectedScore } of cases) {
    const afterMarket = hold(allocate(1000 - initialCash, initialCash));
    const outcome = finish(afterMarket, {
      ...emptyAmounts(),
      stockFund: 300 - expenseCash,
      cash: expenseCash,
    });
    assert.equal(outcome.cashReadinessScore, expectedScore, `cash before expense: ${initialCash} KD`);
    assertScoreRanges(outcome);
  }
});

test("calm score is capped for no sale, proportional for a partial sale, and zero for a full-portfolio sale", () => {
  const allocated = allocate(1000);
  const marketTotal = publicGame(scenario, allocated).totalKd;

  const noSale = finish(hold(allocated), { ...emptyAmounts(), stockFund: 300 });
  assert.equal(noSale.calmScore, 30);
  assertScoreRanges(noSale);

  const partialSaleKd = Math.round(marketTotal * 500) / 1000;
  const partialSale = applyDecision(scenario, allocated, {
    decision: 2, version: 1, action: "sell", asset: "stockFund", amountKd: partialSaleKd,
  });
  const partialOutcome = finish(partialSale, { ...emptyAmounts(), cash: 300 });
  assert.equal(partialOutcome.calmScore, Math.round(30 * (1 - partialSaleKd / marketTotal)));
  assert.ok(partialOutcome.calmScore > 0 && partialOutcome.calmScore < 30);
  assertScoreRanges(partialOutcome);

  const fullSale = applyDecision(scenario, allocated, {
    decision: 2, version: 1, action: "sell", asset: "stockFund", amountKd: marketTotal,
  });
  const fullSaleOutcome = finish(fullSale, { ...emptyAmounts(), cash: 300 });
  assert.equal(fullSaleOutcome.calmScore, 0);
  assertScoreRanges(fullSaleOutcome);
});
