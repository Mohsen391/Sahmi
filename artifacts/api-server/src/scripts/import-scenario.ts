import mongoose from "mongoose";
import { connectMongo } from "../lib/mongo";
import { logger } from "../lib/logger";
import { readSuppliedScenario } from "../lib/scenario-import";
import { Scenario } from "../models/Scenario";

let stage = "validate files";
try {
  const { data, importSources } = await readSuppliedScenario();
  if (process.argv.includes("--validate-only")) {
    logger.info({ series: importSources.map(({symbol, rows}) => ({symbol, rows: rows.length})) }, "Supplied CSV validation passed");
  } else {
    stage = "connect to MongoDB";
    await connectMongo();
    stage = "initialize scenario collection";
    await Scenario.init();
    stage = "read existing scenario";
    const existing = await Scenario.findOne({ scenarioId: data.scenarioId }).select("+importSources").lean();
    if (existing) {
      const hashes = (existing.importSources as Array<{ sha256: string }> | undefined)?.map(source => source.sha256);
      if (JSON.stringify(hashes) !== JSON.stringify(importSources.map(source => source.sha256))) {
        throw new Error("A different scenario import exists. Stop and confirm before replacing it.");
      }
      if (process.argv.includes("--update-stage2")) {
        const storedPrices = (existing.monthlyPrices as Array<Record<string, unknown>>).map(
          ({month, stockFund, bondFund, gold, cash}) => ({month, stockFund, bondFund, gold, cash}),
        );
        if (JSON.stringify(storedPrices) !== JSON.stringify(data.monthlyPrices)) {
          throw new Error("A different scenario price series exists. Stop and confirm before replacing it.");
        }
        // Explicit metadata-only migration. Never replace prices or raw provenance.
        await Scenario.updateOne({ _id: existing._id }, { $set: {
          player: data.player, periodLabel: data.periodLabel, assets: data.assets,
          events: data.events, gameTexts: data.gameTexts,
        } }, { runValidators: true });
        logger.info("Approved Stage 2 copy and event timing stored; historical prices unchanged");
      } else if (process.argv.includes("--update-stage4")) {
        const storedPrices = (existing.monthlyPrices as Array<Record<string, unknown>>).map(
          ({month, stockFund, bondFund, gold, cash}) => ({month, stockFund, bondFund, gold, cash}),
        );
        if (JSON.stringify(storedPrices) !== JSON.stringify(data.monthlyPrices)) {
          throw new Error("A different scenario price series exists. Stop and confirm before replacing it.");
        }
        await Scenario.updateOne({ _id: existing._id }, { $set: { gameTexts: data.gameTexts } }, { runValidators: true });
        logger.info("Approved Stage 4 scoring explanations stored; historical prices unchanged");
      } else {
        logger.info({ scenarioId: data.scenarioId }, "Scenario already imported; no data changed");
      }
    } else {
      stage = "save scenario";
      await Scenario.create({ ...data, importSources });
      logger.info({ scenarioId: data.scenarioId, monthlyObservations: data.monthlyPrices.length }, "Scenario imported from supplied CSVs");
    }
  }
} catch (error) {
  // CSV validation messages cannot contain credentials; connection errors are deliberately sanitized.
  const message = error instanceof Error && (
    error.message.startsWith("SPY:") || error.message.startsWith("AGG:") ||
    error.message.startsWith("GLD:") || error.message.startsWith("A different scenario") ||
    error.message.startsWith("MongoDB ") || error.message === "MONGODB_URI is required"
  ) ? error.message : "Scenario import failed. Check the server-only secret, Atlas access, and source files.";
  logger.error({ stage, errorType: error instanceof Error ? error.name : "Unknown", message }, "Scenario import did not complete");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
