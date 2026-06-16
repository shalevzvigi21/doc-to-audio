#!/bin/sh
set -e
echo "Applying database schema..."
node_modules/.bin/prisma db push --skip-generate
echo "Starting server..."
exec node dist/index.js
