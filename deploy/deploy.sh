#!/bin/bash
set -e

SERVER_IP="43.242.227.51"
DEPLOY_PATH="/var/www/oppoint_booking"

echo "=== Slotcare Deployment Script ==="
echo "This script will help you deploy to $SERVER_IP"
echo ""

# Check if we have the built files
if [ ! -d "apps/backend/dist" ]; then
    echo "ERROR: Backend not built yet. Run deploy/build.sh first."
    exit 1
fi

if [ ! -d "apps/backend/dist/frontend" ]; then
    echo "ERROR: Frontend build not found in backend/dist/frontend. Run deploy/build.sh first."
    exit 1
fi

echo "1. Build verified. Ready to deploy."
echo ""
echo "2. To deploy to the server, run these commands on your LOCAL machine:"
echo ""
echo "   # Copy backend files to server (the .env is already on the server; do not overwrite it):"
echo "   scp -r apps/backend/dist root@$SERVER_IP:$DEPLOY_PATH/apps/backend/dist"
echo "   scp apps/backend/package.json root@$SERVER_IP:$DEPLOY_PATH/apps/backend/"
echo "   scp -r apps/backend/prisma root@$SERVER_IP:$DEPLOY_PATH/apps/backend/"
echo ""
echo "3. Then SSH into the server and run setup:"
echo ""
echo "   ssh root@$SERVER_IP"
echo "   cd $DEPLOY_PATH/apps/backend"
echo "   npm install --production"
echo "   npx prisma migrate deploy"
echo "   npx prisma generate"
echo ""
echo "4. Update systemd service and restart:"
echo ""
echo "   cp $DEPLOY_PATH/deploy/slotcare.service /etc/systemd/system/"
echo "   systemctl daemon-reload"
echo "   systemctl enable slotcare"
echo "   systemctl restart slotcare"
echo ""
echo "5. Setup Nginx (optional but recommended):"
echo ""
echo "   apt install nginx -y"
echo "   cp $DEPLOY_PATH/deploy/nginx.conf /etc/nginx/sites-available/slotcare"
echo "   ln -s /etc/nginx/sites-available/slotcare /etc/nginx/sites-enabled/"
echo "   rm -f /etc/nginx/sites-enabled/default"
echo "   nginx -t"
echo "   systemctl restart nginx"
echo ""
echo "The app will be available at http://$SERVER_IP:4000"
echo ""
echo "Check status: systemctl status slotcare"
echo "View logs: journalctl -u slotcare -f"
