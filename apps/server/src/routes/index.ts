import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import hotelRouter from "./hotel.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(hotelRouter);

export default router;
