import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scenariosRouter from "./scenarios";
import gameRouter from "./game";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scenariosRouter);
router.use(gameRouter);

export default router;
