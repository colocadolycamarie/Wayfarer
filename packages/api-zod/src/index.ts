export * from "./generated/api.js";
// Note: ./generated/types re-exports per-parameter TS types (e.g. path params)
// that collide by name with the runtime zod schemas above in a few endpoints.
// Nothing in this workspace currently needs those types directly — everything
// consumes the zod schemas (and their z.infer'd types) from ./generated/api —
// so the barrel is intentionally not re-exported here to avoid the collision.
// Import a specific file under ./generated/types directly if you ever need one.
