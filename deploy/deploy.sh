#!/bin/bash
set -e

SERVER_IP="156.67.105.64"
DEPLOY_PATH="/var/www/adelphos_frontend"

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
echo "   # Copy backend files to server:"
echo "   scp -r apps/backend/dist root@$SERVER_IP:$DEPLOY_PATH/dist"
echo "   scp apps/backend/package.json root@$SERVER_IP:$DEPLOY_PATH/"
echo "   scp -r apps/backend/prisma root@$SERVER_IP:$DEPLOY_PATH/"
echo "   scp apps/backend/.env root@$SERVER_IP:$DEPLOY_PATH/"
echo ""
echo "   # Copy frontend build (already included in backend/dist/frontend)"
echo ""
echo "3. Then SSH into the server and run setup:"
echo ""
echo "   ssh root@$SERVER_IP"
echo "   cd $DEPLOY_PATH"
echo "   npm install --production"
echo "   npx prisma migrate deploy"
echo "   npx prisma generate"
echo ""
echo "4. Setup systemd service:"
echo ""
echo "   cp deploy/slotcare.service /etc/systemd/system/"
echo "   systemctl daemon-reload"
echo "   systemctl enable slotcare"
echo "   systemctl start slotcare"
echo ""
echo "5. Setup Nginx (optional but recommended):"
echo ""
echo "   apt install nginx -y"
echo "   cp deploy/nginx.conf /etc/nginx/sites-available/slotcare"
echo "   ln -s /etc/nginx/sites-available/slotcare /etc/nginx/sites-enabled/"
echo "   rm -f /etc/nginx/sites-enabled/default"
echo "   nginx -t"
echo "   systemctl restart nginx"
echo ""
echo "The app will be available at http://$SERVER_IP"
echo ""
echo "Check status: systemctl status slotcare"
echo "View logs: journalctl -u slotcare -f"
