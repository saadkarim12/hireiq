#!/bin/bash
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"

echo "Starting HireIQ..."

# Start PostgreSQL if not running
docker start hireiq-postgres 2>/dev/null || echo "PostgreSQL already running"

# Start all backend services
cd ~/hireiq/backend
npx concurrently \
  --names "API,AI,WA,SCHED" \
  --prefix-colors "cyan,magenta,green,yellow" \
  "npx ts-node src/core-api/index.ts" \
  "npx ts-node src/ai-engine/index.ts" \
  "npx ts-node src/whatsapp-service/index.ts" \
  "npx ts-node src/scheduler/index.ts"
