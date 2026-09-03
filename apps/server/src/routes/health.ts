import { Router, type RequestHandler } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router = Router();

const getHealthz: RequestHandler = (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
};

router.get("/healthz", getHealthz);

export default router;