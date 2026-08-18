import express from "express";
import cors from "cors";
import pinoHttp, { type Options as PinoHttpOptions } from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

// pino-http ships CommonJS with no "exports" map. Under most resolution
// modes the default import above is already the callable function (and
// that's what actually runs), but strict "nodenext" resolution (used by
// some build environments, e.g. Vercel's function bundler) mis-infers its
// type as non-callable. This cast only affects the type-checker, not
// runtime behavior â€” pinoHttpLogger is the exact same value as pinoHttp.
// Options is kept as the real pino-http type so the serializer callbacks
// below still get properly typed req/res parameters.
const pinoHttpLogger = pinoHttp as unknown as (
  opts: PinoHttpOptions,
) => ReturnType<typeof express>;

const app = express();

app.use(
  pinoHttpLogger({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
