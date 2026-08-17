import { Router, type IRouter } from "express";
import healthRouter from "./health";
import hotelRouter from "./hotel";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hotelRouter);

export default router;
