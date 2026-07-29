module.exports = {
  apps: [
    {
      name: 'slotcare',
      script: 'dist/index.js',
      cwd: '/var/www/oppoint_booking',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      time: true,
      error_file: '/var/log/slotcare/error.log',
      out_file: '/var/log/slotcare/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
