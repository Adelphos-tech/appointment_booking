#!/bin/bash
set -e

DEPLOY_PATH="/var/www/adelphos_frontend"

echo "=== Slotcare Server Setup ==="

cd $DEPLOY_PATH

# Install dependencies
echo "Installing dependencies..."
npm install --production

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "Running database migrations..."
npx prisma migrate deploy

# Create systemd service
echo "Setting up systemd service..."
cp deploy/slotcare.service /etc/systemd/system/ || cp $DEPLOY_PATH/slotcare.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable slotcare

# Start service
echo "Starting Slotcare service..."
systemctl start slotcare

# Check status
echo ""
echo "Service status:"
systemctl status slotcare --no-pager

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "App running on port 4000"
echo "Check logs: journalctl -u slotcare -f"
echo "=========================================="
