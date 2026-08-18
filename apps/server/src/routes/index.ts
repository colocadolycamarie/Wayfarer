import { Router } from "express";
import healthRouter from "./health.js";
import hotelRouter from "./hotel.js";

const router = Router();

router.use(healthRouter);
router.use(hotelRouter);

export default router;
