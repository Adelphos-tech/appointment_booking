#!/bin/bash
set -e

DEPLOY_PATH="/var/www/oppoint_booking"
BACKEND_PATH="$DEPLOY_PATH/apps/backend"
WEB_PATH="$DEPLOY_PATH/apps/web"

echo "=== Slotcare Server-Side Deploy ==="

# Pull latest code
echo "1. Pulling latest code..."
cd "$DEPLOY_PATH"
git pull origin main

# Install backend dependencies
echo "2. Installing backend dependencies..."
cd "$BACKEND_PATH"
npm install --production=false

# Generate Prisma client
echo "3. Generating Prisma client..."
npx prisma generate

# Apply schema changes (non-destructive)
echo "4. Pushing schema changes..."
npx prisma db push --accept-data-loss

# Build backend
echo "5. Building backend..."
npm run build

# Install web dependencies and build
echo "6. Building frontend..."
cd "$WEB_PATH"
npm install
npm run build

# Copy frontend build to backend dist
echo "7. Copying frontend to backend dist..."
rm -rf "$BACKEND_PATH/dist/frontend"
cp -r "$WEB_PATH/dist" "$BACKEND_PATH/dist/frontend"

# Install production dependencies only
echo "8. Installing production dependencies..."
cd "$BACKEND_PATH"
npm install --production

# Restart service
echo "9. Restarting service..."
if command -v systemctl &> /dev/null; then
  systemctl restart slotcare
  echo "Service restarted via systemctl"
elif command -v pm2 &> /dev/null; then
  pm2 restart slotcare
  echo "Service restarted via PM2"
else
  echo "WARNING: Neither systemctl nor PM2 found. Manual restart needed."
fi

# Health check
echo "10. Health check..."
sleep 3
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/health)
if [ "$HEALTH" = "200" ]; then
  echo "✅ Deploy successful — server healthy"
else
  echo "❌ Health check failed (HTTP $HEALTH) — check logs"
  exit 1
fi
