#!/bin/bash
set -e

echo "Building Slotcare for production..."

# Build frontend
cd /Users/shivang/Desktop/Oppoint\ booking/apps/web
npm run build

# Build backend
cd /Users/shivang/Desktop/Oppoint\ booking/apps/backend
npm run build

# Copy frontend build to backend dist folder
rm -rf "/Users/shivang/Desktop/Oppoint booking/apps/backend/dist/frontend"
cp -r "/Users/shivang/Desktop/Oppoint booking/apps/web/dist" "/Users/shivang/Desktop/Oppoint booking/apps/backend/dist/frontend"

echo "Build complete. Ready for deployment."
