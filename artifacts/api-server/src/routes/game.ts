import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHash, randomBytes } from "node:crypto";
import {
  GetSahmiScenarioResponse, GetSahmiGameResponse,
  StartSahmiGameResponse, SubmitSahmiDecisionBody, SubmitSahmiDecisionResponse,
} from "@workspace/api-zod";
import { connectMongo } from "../lib/mongo";
import { Scenario } from "../models/Scenario";
import { GameSession } from "../models/GameSession";
import { applyDecision, copy, emptyAmounts, GameError, publicGame, type SessionData } from "../lib/game-engine";

const router: IRouter = Router();
const cookieName = "sahmi_session";
const scenarioId = "sahmi-2020";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

function tokenHash(req: Request) {
  const token: unknown = req.cookies?.[cookieName];
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? hash(token) : null;
}

function protect(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "POST" && req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "الطلب مو مسموح من هالموقع." });
    return;
  }
  next();
}
router.use("/game", protect);

async function readScenario() {
  const stored = await Scenario.findOne({ scenarioId }).lean();
  if (!stored) throw new Error("Approved scenario is unavailable");
  return GetSahmiScenarioResponse.parse(stored);
}

const active = (req: Request) => ({
  tokenHash: tokenHash(req), expiresAt: { $gt: new Date() },
});

function handleFailure(error: unknown, req: Request, res: Response) {
  if (error instanceof GameError) {
    res.status(error.status).json({ error: error.message });
  } else {
    req.log.warn("Session database read, write, or scenario validation unavailable");
    res.status(503).json({ error: "ما قدرنا نحفظ أو نحمل اللعبة الحين. جرّب مرة ثانية، ولا تسكّر الصفحة." });
  }
}

router.get("/game", async (req, res): Promise<void> => {
  try {
    if (!tokenHash(req)) throw new GameError("ما عندك لعبة بهالجلسة. ابدأ لعبة يديدة.", 404);
    await connectMongo();
    const game = await GameSession.findOne(active(req)).lean();
    if (!game) throw new GameError("انتهت الجلسة. ابدأ لعبة يديدة.", 404);
    res.json(GetSahmiGameResponse.parse(publicGame(await readScenario(), game as unknown as SessionData)));
  } catch (error) { handleFailure(error, req, res); }
});

router.post("/game", async (req, res): Promise<void> => {
  try {
    await connectMongo();
    const s = await readScenario();
    await GameSession.init();
    const token = randomBytes(32).toString("hex");
    const game: SessionData = {
      version: 0, nextDecision: 1,
      units: { ...emptyAmounts(), cash: s.player.startingSavingsKd },
      decisions: [], expensePaidKd: 0,
    };
    const response = StartSahmiGameResponse.parse(publicGame(s, game));
    await GameSession.create({
      ...game, tokenHash: hash(token), scenarioId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    res.cookie(cookieName, token, {
      httpOnly: true, sameSite: "strict", path: "/api/game",
      secure: req.secure || req.get("x-forwarded-proto") === "https",
      // No persistent cookie: this is only the current anonymous browser session.
    });
    res.status(201).json(response);
  } catch (error) { handleFailure(error, req, res); }
});

router.post("/game/decisions", async (req, res): Promise<void> => {
  try {
    if (!tokenHash(req)) throw new GameError("ما عندك لعبة بهالجلسة. ابدأ لعبة يديدة.", 404);
    await connectMongo();
    const s = await readScenario();
    const parsed = SubmitSahmiDecisionBody.safeParse(req.body);
    if (!parsed.success) {
      const key = req.body?.decision === 1 ? "invalidAllocation" : req.body?.decision === 3 ? "invalidExpense" : null;
      throw new GameError(key ? copy(s, key) : "الطلب مو صحيح.");
    }
    // Generated object validators strip extras; reject them rather than accepting
    // user-supplied balances, identities, holdings, or unknown asset names.
    const allowed = ["decision", "version", "amounts", "action", "asset", "amountKd"];
    if (Object.keys(req.body).some(k => !allowed.includes(k))
      || (req.body.amounts && Object.keys(req.body.amounts).some(k => !["stockFund", "bondFund", "gold", "cash"].includes(k)))) {
      throw new GameError("الطلب مو صحيح.");
    }
    const stored = await GameSession.findOne(active(req)).lean();
    if (!stored) throw new GameError("انتهت الجلسة. ابدأ لعبة يديدة.", 404);
    const next = applyDecision(s, stored as unknown as SessionData, parsed.data);
    const response = SubmitSahmiDecisionResponse.parse(publicGame(s, next));
    // One conditional atomic write prevents double-clicks/concurrent tabs from
    // submitting the same decision twice. Invalid requests never change a game.
    const updated = await GameSession.updateOne(
      { ...active(req), version: parsed.data.version, nextDecision: parsed.data.decision },
      { $set: next }, { runValidators: true },
    );
    if (updated.modifiedCount !== 1) {
      throw new GameError("هالقرار انحفظ من قبل. حدّث الصفحة وشوف آخر حالة.", 409);
    }
    res.json(response);
  } catch (error) { handleFailure(error, req, res); }
});

export default router;
