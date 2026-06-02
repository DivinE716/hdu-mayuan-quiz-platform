// PM2 进程管理配置
module.exports = {
  apps: [
    {
      name: "mayuan-quiz",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/var/www/mayuan-quiz",
      exec_mode: "fork",          // 单实例（2G 内存用 cluster 会 OOM）
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M", // 超过 500M 自动重启
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // 日志
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "/var/www/mayuan-quiz/logs/error.log",
      out_file: "/var/www/mayuan-quiz/logs/out.log",
      merge_logs: true,
    },
  ],
};
