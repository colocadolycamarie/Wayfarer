import { Router } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router = Router();

// Vercel's serverless function bundler runs its own, separate TypeScript
// check on this file (outside our normal build), and its type-checker is
// known not to reliably resolve @types/express in that isolated context —
// it's especially prone to this on the first Express-typed file it hits
// (this route module is imported first in routes/index.ts). Typing the
// handler params explicitly here avoids depending on that inference; it
// has no effect on runtime behavior (Express still passes the real
// Request/Response objects).
router.get("/healthz", (_req: unknown, res: { json: (body: unknown) => void }) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
