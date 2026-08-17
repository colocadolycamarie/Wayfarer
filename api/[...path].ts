// Vercel serverless entry point. Vercel routes any request under /api/*
// to this function (file-based routing via the [...path] catch-all) and
// invokes it with the standard Node request/response objects — which is
// exactly what an Express app's request handler expects, so no adapter
// layer is needed beyond re-exporting it as the default export.
//
// This file is Vercel-specific. For a traditional always-on host
// (Railway, Render, Fly, plain Node), use apps/server/src/index.ts instead,
// which wraps the same Express app with app.listen().
export { default } from "../apps/server/src/app.js";
