#!/bin/bash
# Pushes the Drizzle schema straight to the database (dev convenience — no migration files).
# Run manually after pulling schema changes, e.g. from a git post-merge hook:
#   ln -s ../../scripts/push-db-schema.sh .git/hooks/post-merge
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
