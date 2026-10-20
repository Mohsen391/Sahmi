import mongoose, { Schema } from "mongoose";

const amounts = new Schema({
  stockFund: { type: Number, required: true, min: 0 },
  bondFund: { type: Number, required: true, min: 0 },
  gold: { type: Number, required: true, min: 0 },
  cash: { type: Number, required: true, min: 0 },
}, { _id: false });

const session = new Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  scenarioId: { type: String, required: true },
  version: { type: Number, required: true, default: 0 },
  nextDecision: { type: Number, required: true, enum: [1, 2, 3, 4], default: 1 },
  units: { type: amounts, required: true },
  expensePaidKd: { type: Number, default: 0, min: 0 },
  // Each atomic save includes the exact input and its server-calculated outcome.
  decisions: { type: [Schema.Types.Mixed], default: [] },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true, collection: "game_sessions" });

export const GameSession = mongoose.models.SahmiGameSession
  ?? mongoose.model("SahmiGameSession", session);
