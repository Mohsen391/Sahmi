import mongoose, { Schema } from "mongoose";

const options = { _id: false };
const text = { type: String, required: true };
const amount = { type: Number, required: true, min: 0 };

const player = new Schema({
  name: text,
  age: amount,
  startingSavingsKd: amount,
  goal: text,
  goalMonths: amount,
}, options);

const asset = new Schema({
  id: { type: String, enum: ["stockFund", "bondFund", "gold", "cash"], required: true },
  label: text,
  symbol: { type: String, default: null },
  source: text,
}, options);

const prices = new Schema({
  month: { type: String, match: /^\d{4}-\d{2}$/, required: true },
  stockFund: { ...amount, min: Number.MIN_VALUE },
  bondFund: { ...amount, min: Number.MIN_VALUE },
  gold: { ...amount, min: Number.MIN_VALUE },
  cash: { type: Number, required: true, enum: [1] },
}, options);

const event = new Schema({
  id: text,
  month: { type: String, match: /^\d{4}-\d{2}$/, required: true },
  type: { type: String, enum: ["marketDrop", "surpriseExpense"], required: true },
  title: text,
  description: text,
  amountKd: { type: Number, min: 0, default: null },
}, options);

const explanation = new Schema({
  decision: { type: Number, enum: [1, 2, 3], required: true },
  title: text,
  text,
}, options);

const dataInfo = new Schema({
  sourceName: text,
  retrievedOn: text,
  priceCurrency: { type: String, enum: ["USD"], required: true },
  pricingNote: text,
  limitations: text,
}, options);

const sourceRow = new Schema({
  month: text,
  adjusted_close: { ...amount, min: Number.MIN_VALUE },
  close: { ...amount, min: Number.MIN_VALUE },
}, options);

const sourceFile = new Schema({
  symbol: text,
  fileName: text,
  sha256: text,
  sourceUrl: text,
  rows: { type: [sourceRow], required: true },
}, options);

const scenarioSchema = new Schema({
  scenarioId: { type: String, required: true, unique: true },
  title: text,
  periodLabel: text,
  player: { type: player, required: true },
  assets: {
    type: [asset],
    required: true,
    validate: (value: unknown[]) => value.length === 4,
  },
  monthlyPrices: {
    type: [prices],
    required: true,
    validate: (value: unknown[]) => value.length === 13,
  },
  events: {
    type: [event],
    required: true,
    validate: (value: unknown[]) => value.length === 2,
  },
  decisionExplanations: {
    type: [explanation],
    required: true,
    validate: (value: unknown[]) => value.length === 3,
  },
  disclaimer: text,
  dataInfo: { type: dataInfo, required: true },
  importSources: { type: [sourceFile], required: true, select: false },
}, { timestamps: true, collection: "scenarios" });

export const Scenario = mongoose.models.SahmiScenario
  ?? mongoose.model("SahmiScenario", scenarioSchema);
