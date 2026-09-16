// Vercel serverless entry point. Vercel routes any request under /api/*
// to this function (file-based routing via the [...path] catch-all) and
// invokes it with the standard Node request/response objects — which is
// exactly what an Express app's request handler expects, so no adapter
// layer is needed beyond re-exporting it as the default export.
//
// This imports the pre-compiled, plain-JavaScript build of the Express
// app (produced by apps/server/build.mjs during the project's
// buildCommand), not the raw TypeScript source. Vercel's Node.js function
// builder runs its own separate, isolated TypeScript type-check/transpile
// pass over any .ts file reachable from this entry point, and that
// checker unreliably resolves @types/express in that isolated context.
// Shipping this handler as plain JavaScript backed by an already-compiled
// app bundle means there are no .ts files left in the reachable import
// graph, so that builder never runs its type-check pass on our server
// code at all.
//
// This file is Vercel-specific. For a traditional always-on host
// (Railway, Render, Fly, plain Node), use apps/server/src/index.ts instead,
// which wraps the same Express app with app.listen().
export { default } from "../apps/server/dist/app.mjs";
