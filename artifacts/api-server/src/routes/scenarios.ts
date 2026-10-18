import { Router, type IRouter } from "express";
import { GetSahmiScenarioParams, GetSahmiScenarioResponse } from "@workspace/api-zod";
import { connectMongo } from "../lib/mongo";
import { Scenario } from "../models/Scenario";

const router: IRouter = Router();

router.get("/scenarios/:scenarioId", async (req, res): Promise<void> => {
  const parsed = GetSahmiScenarioParams.safeParse(req.params);
  if (!parsed.success || !/^[a-z0-9-]{1,80}$/.test(parsed.data.scenarioId)) {
    res.status(400).json({ error: "اسم السيناريو مو صحيح." });
    return;
  }
  try {
    await connectMongo();
  } catch {
    req.log.warn("Scenario database connection unavailable");
    res.status(503).json({ error: "ما قدرنا نوصل للبيانات الحين. جرّب مرة ثانية بعد شوي." });
    return;
  }
  try {
    const scenario = await Scenario.findOne({ scenarioId: parsed.data.scenarioId }).lean();
    if (!scenario) {
      res.status(404).json({ error: "ما لقينا هالسيناريو." });
      return;
    }
    res.json(GetSahmiScenarioResponse.parse(scenario));
  } catch {
    req.log.error("Scenario read or response validation failed");
    res.status(500).json({ error: "صار خطأ بتحميل السيناريو. جرّب مرة ثانية." });
  }
});

export default router;
