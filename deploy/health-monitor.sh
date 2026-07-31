#!/bin/bash
# Slotcare health check monitor — runs every minute via cron
# Restarts the service if health check fails 3 times in a row

HEALTH_URL="http://localhost:4000/api/health"
FAIL_FILE="/tmp/slotcare_health_fails"
MAX_FAILS=3
ALERT_EMAIL=""

response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null)

if [ "$response" = "200" ]; then
  # Reset fail counter on success
  if [ -f "$FAIL_FILE" ]; then
    fails=$(cat "$FAIL_FILE")
    if [ "$fails" -gt 0 ]; then
      echo "[$(date)] Health check recovered after $fails failures" >> /var/log/slotcare/health-monitor.log
    fi
    rm -f "$FAIL_FILE"
  fi
  exit 0
fi

# Health check failed
fails=1
if [ -f "$FAIL_FILE" ]; then
  fails=$(($(cat "$FAIL_FILE") + 1))
fi
echo "$fails" > "$FAIL_FILE"

echo "[$(date)] Health check failed (HTTP $response) — attempt $fails/$MAX_FAILS" >> /var/log/slotcare/health-monitor.log

if [ "$fails" -ge "$MAX_FAILS" ]; then
  echo "[$(date)] CRITICAL: Health check failed $fails times — restarting service" >> /var/log/slotcare/health-monitor.log

  if command -v pm2 &> /dev/null; then
    pm2 restart slotcare
    echo "[$(date)] PM2 restart triggered" >> /var/log/slotcare/health-monitor.log
  elif command -v systemctl &> /dev/null; then
    systemctl restart slotcare
    echo "[$(date)] systemctl restart triggered" >> /var/log/slotcare/health-monitor.log
  fi

  # Reset counter after restart
  rm -f "$FAIL_FILE"
fi
