/**
 * 马原刷题平台 · Node.js 自动化部署脚本
 *
 * 使用 ssh2 库实现 SSH 密码/密钥认证，无需依赖 sshpass
 * 用法: node deploy/deploy.js
 *
 * 前置条件: 项目根目录下有 .env.deploy 文件
 */

const { Client } = require("ssh2");
const { readFileSync, existsSync, createWriteStream, createReadStream, statSync } = require("fs");
const { execSync } = require("child_process");
const path = require("path");
const { pipeline } = require("stream/promises");

// ---- 确定 npm / node / tar 可执行文件路径 ----
const NODE_EXE = process.execPath; // 当前 node 的完整路径
const NODE_DIR = path.dirname(NODE_EXE);

// npm 可能在同级目录或上级目录中
const NPM_CANDIDATES = [
  path.join(NODE_DIR, "npm.cmd"),
  path.join(NODE_DIR, "npm"),
  "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Microsoft\\VisualStudio\\NodeJs\\npm.cmd",
  "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Microsoft\\VisualStudio\\NodeJs\\node_modules\\npm\\bin\\npm-cli.js",
];

let NPM_CMD = "npm";
for (const c of NPM_CANDIDATES) {
  if (existsSync(c)) { NPM_CMD = c; break; }
}

// 调用 npm（Windows 上 .cmd 不能直接 execSync，需要用 node 启动 cli）
function npmExec(args, opts = {}) {
  const npmCli = NPM_CMD.endsWith(".cmd")
    ? path.join(path.dirname(NPM_CMD), "node_modules", "npm", "bin", "npm-cli.js")
    : NPM_CMD;
  const cmd = NPM_CMD.endsWith(".cmd") || NPM_CMD.endsWith(".js")
    ? `"${NODE_EXE}" "${npmCli}" ${args}`
    : `"${NPM_CMD}" ${args}`;
  return execSync(cmd, { stdio: "inherit", cwd: PROJECT_DIR, ...opts });
}

// tar 命令（Windows Git Bash 下通常有）
const TAR_CMD = "tar";

// ============================================================
// 配置
// ============================================================

const PROJECT_DIR = path.resolve(__dirname, "..");
const DEPLOY_DIR = "/var/www/mayuan-quiz";
const DEPLOY_PACKAGE = "deploy.tar.gz";
const PORT = 3000;

// 读取凭证
const envFile = path.join(PROJECT_DIR, ".env.deploy");
if (!existsSync(envFile)) {
  console.error("❌ 找不到 .env.deploy 文件！");
  process.exit(1);
}

const envLines = readFileSync(envFile, "utf-8").split(/\r?\n/);
const env = {};
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const SERVER_IP = env.SERVER_IP;
const SERVER_USER = env.SERVER_USER || "root";

let sshConfig;
if (env.SSH_KEY) {
  const keyPath = env.SSH_KEY.replace(/^~/, process.env.HOME || "/root");
  if (!existsSync(keyPath)) {
    console.error(`❌ SSH 密钥文件不存在: ${keyPath}`);
    process.exit(1);
  }
  sshConfig = {
    host: SERVER_IP,
    port: 22,
    username: SERVER_USER,
    privateKey: readFileSync(keyPath, "utf-8"),
    readyTimeout: 15000,
  };
} else if (env.SSH_PASSWORD) {
  sshConfig = {
    host: SERVER_IP,
    port: 22,
    username: SERVER_USER,
    password: env.SSH_PASSWORD,
    readyTimeout: 15000,
  };
} else {
  console.error("❌ .env.deploy 中缺少 SSH_KEY 或 SSH_PASSWORD");
  process.exit(1);
}

// ============================================================
// SSH 工具函数
// ============================================================

function sshConnect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => resolve(conn));
    conn.on("error", (err) => reject(err));
    conn.connect(sshConfig);
  });
}

function sshExec(conn, cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, opts, (err, stream) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream.on("data", (d) => {
        stdout += d.toString();
        if (opts.print !== false) process.stdout.write(d);
      });
      stream.stderr.on("data", (d) => {
        stderr += d.toString();
        if (opts.print !== false) process.stderr.write(d);
      });
      stream.on("close", (code) => {
        resolve({ code, stdout, stderr });
      });
    });
  });
}

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (err) => {
        if (err) return reject(err);
        console.log(`   已上传: ${path.basename(localPath)}`);
        resolve();
      });
    });
  });
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   马原刷题平台 · 自动化部署            ║");
  console.log("╚══════════════════════════════════════════╝\n");

  console.log(`🎯 目标服务器: ${SERVER_USER}@${SERVER_IP}\n`);

  // ---- 连接 ----
  console.log("📡 连接 SSH...");
  let conn;
  try {
    conn = await sshConnect();
    console.log("   ✅ SSH 连接成功\n");
  } catch (err) {
    console.error(`   ❌ SSH 连接失败: ${err.message}`);
    console.error("   请检查 IP / 端口 / 密码 / 安全组（需放行 22 端口）");
    process.exit(1);
  }

  try {
    // ============================================================
    // Step 1: 服务器环境检查
    // ============================================================
    console.log("━".repeat(50));
    console.log("📦 Step 1: 服务器环境检查与安装\n");

    // 1.1 系统信息
    console.log("1.1 系统信息:");
    await sshExec(conn, "cat /etc/os-release | head -4; echo ''");

    // 1.2 安装 Nginx
    console.log("1.2 安装 Nginx...");
    const nginxCheck = await sshExec(conn, "command -v nginx && echo 'INSTALLED' || echo 'NEED_INSTALL'", { print: false });
    if (nginxCheck.stdout.includes("NEED_INSTALL")) {
      await sshExec(conn, "dnf install -y nginx 2>&1 | tail -5");
      await sshExec(conn, "systemctl enable nginx && systemctl start nginx");
      console.log("   ✅ Nginx 安装完成");
    } else {
      console.log("   ✅ Nginx 已安装");
    }

    // 1.3 安装 Node.js 20
    console.log("1.3 安装 Node.js 20...");
    const nodeCheck = await sshExec(conn, "command -v node && node --version || echo 'NEED_INSTALL'", { print: false });
    if (nodeCheck.stdout.includes("NEED_INSTALL")) {
      await sshExec(conn,
        "curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>&1 | tail -3 && dnf install -y nodejs 2>&1 | tail -5"
      );
      console.log("   ✅ Node.js 安装完成");
    } else {
      console.log(`   ✅ Node.js 已安装: ${nodeCheck.stdout.trim()}`);
    }

    // 1.4 安装 PM2
    console.log("1.4 安装 PM2...");
    const pm2Check = await sshExec(conn, "command -v pm2 && pm2 --version || echo 'NEED_INSTALL'", { print: false });
    if (pm2Check.stdout.includes("NEED_INSTALL")) {
      await sshExec(conn, "npm install -g pm2 2>&1 | tail -3");
      console.log("   ✅ PM2 安装完成");
    } else {
      console.log(`   ✅ PM2 已安装: ${pm2Check.stdout.trim()}`);
    }

    // ============================================================
    // Step 2: 本地构建
    // ============================================================
    console.log("\n" + "━".repeat(50));
    console.log("🔨 Step 2: 本地构建项目\n");

    process.chdir(PROJECT_DIR);

    console.log("2.1 npm run build...");
    npmExec("run build");
    console.log("   ✅ 构建完成");

    console.log("2.2 打包 deploy.tar.gz...");
    execSync(
      `${TAR_CMD} -czf ${DEPLOY_PACKAGE} ` +
      `--exclude='node_modules' --exclude='.git' --exclude='.next/cache' --exclude='deploy.tar.gz' ` +
      `--exclude='*.db' --exclude='*.db-journal' --exclude='*.db-wal' --exclude='*.db-shm' ` +
      `src .next public prisma package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs .env deploy/ecosystem.config.js`,
      { cwd: PROJECT_DIR, stdio: "inherit" }
    );
    const pkgSize = (statSync(path.join(PROJECT_DIR, DEPLOY_PACKAGE)).size / 1024 / 1024).toFixed(1);
    console.log(`   ✅ 打包完成 (${pkgSize} MB)`);

    // ============================================================
    // Step 3: 上传
    // ============================================================
    console.log("\n" + "━".repeat(50));
    console.log("📤 Step 3: 上传文件到服务器\n");

    // 创建目标目录
    await sshExec(conn, `mkdir -p ${DEPLOY_DIR}/logs /tmp`);
    console.log("   ✅ 目标目录就绪");

    // 上传压缩包
    console.log("3.1 上传 deploy.tar.gz ...");
    await sftpPut(conn, path.join(PROJECT_DIR, DEPLOY_PACKAGE), `/tmp/${DEPLOY_PACKAGE}`);

    // 上传 Nginx 配置
    console.log("3.2 上传 Nginx 配置...");
    await sftpPut(conn, path.join(__dirname, "nginx.conf"), "/tmp/mayuan-quiz-nginx.conf");

    // 备份数据库（部署前）
    console.log("3.3 备份服务器数据库...");
    await sshExec(conn,
      `if [ -f ${DEPLOY_DIR}/prisma/dev.db ]; then ` +
      `cp ${DEPLOY_DIR}/prisma/dev.db ${DEPLOY_DIR}/prisma/dev.db.bak && echo '   已备份 dev.db → dev.db.bak'; ` +
      `else echo '   无现有数据库，跳过备份'; fi`
    );

    // 解压
    console.log("3.4 服务器端解压...");
    await sshExec(conn,
      `rm -rf ${DEPLOY_DIR}/.next ${DEPLOY_DIR}/public ${DEPLOY_DIR}/deploy && ` +
      `rm -rf ${DEPLOY_DIR}/prisma/schema.prisma && ` +
      `tar -xzf /tmp/${DEPLOY_PACKAGE} -C ${DEPLOY_DIR}/ && ` +
      `rm -f /tmp/${DEPLOY_PACKAGE} && ` +
      `echo '解压完成'`
    );

    // ============================================================
    // Step 4: 服务器端安装 & 重建
    // ============================================================
    console.log("\n" + "━".repeat(50));
    console.log("📥 Step 4: 安装依赖 & 服务器重建\n");

    console.log("4.1 npm install (含 devDeps，构建需要)...");
    await sshExec(conn, `cd ${DEPLOY_DIR} && npm install 2>&1 | tail -5`);

    console.log("4.2 prisma generate...");
    await sshExec(conn, `cd ${DEPLOY_DIR} && npx prisma generate 2>&1`);

    console.log("4.3 服务器端构建（限内存 1.5GB）...");
    await sshExec(conn,
      `cd ${DEPLOY_DIR} && NODE_OPTIONS="--max-old-space-size=1536" npm run build 2>&1`
    );
    console.log("   ✅ 构建完成");

    // ============================================================
    // Step 5: PM2 启动
    // ============================================================
    console.log("\n" + "━".repeat(50));
    console.log("🚀 Step 5: PM2 启动服务\n");

    await sshExec(conn,
      `cd ${DEPLOY_DIR} && ` +
      `if pm2 list 2>/dev/null | grep -q mayuan-quiz; then ` +
      `  pm2 restart mayuan-quiz && echo '应用已重启'; ` +
      `else ` +
      `  pm2 start deploy/ecosystem.config.js && echo '应用已启动'; ` +
      `fi && pm2 save`
    );

    // 开机自启
    console.log("5.2 配置 PM2 开机自启...");
    await sshExec(conn, "pm2 startup systemd -u root --hp /root 2>&1 || true", { print: false });
    console.log("   ✅ 完成");

    // ============================================================
    // Step 6: Nginx 配置（兼容宝塔面板）
    // ============================================================
    console.log("\n" + "━".repeat(50));
    console.log("🌐 Step 6: Nginx 反向代理配置\n");

    // 检测是否为宝塔面板环境
    const btCheck = await sshExec(conn, "test -d /www/server/panel && echo 'BT' || echo 'STD'", { print: false });

    if (btCheck.stdout.includes("BT")) {
      // 宝塔面板：替换默认站点配置
      console.log("   检测到宝塔面板，使用 0.default.conf 方案...");
      const nginxConf = `server
{
    listen 80;
    server_name _;

    # 关键：禁用宝塔面板全局 proxy_cache
    proxy_cache off;

    access_log /www/wwwlogs/mayuan-quiz-access.log;
    error_log  /www/wwwlogs/mayuan-quiz-error.log;

    location /
    {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_hide_header Cache-Control;
        add_header Cache-Control "no-cache, must-revalidate" always;
    }

    location /_next/static
    {
        alias /var/www/mayuan-quiz/.next/static;
        expires 365d;
        add_header Cache-Control "public, immutable";
        try_files $uri =410;
    }
}`;
      const b64 = Buffer.from(nginxConf).toString("base64");
      await sshExec(conn, `echo '${b64}' | base64 -d > /www/server/panel/vhost/nginx/0.default.conf`);

      // 确保 log_format 存在（宝塔依赖）
      await sshExec(conn,
        "grep -q 'site_total' /www/server/panel/vhost/nginx/0.site_total_log_format.conf 2>/dev/null || " +
        "echo \"log_format site_total '\\$remote_addr - \\$remote_user [\\$time_local] \\\"\\$request\\\" \\$status \\$body_bytes_sent \\\"\\$http_referer\\\" \\\"\\$http_user_agent\\\"';\" > /www/server/panel/vhost/nginx/0.site_total_log_format.conf",
        { print: false }
      );
    } else {
      // 标准环境：使用 /etc/nginx/conf.d/
      await sshExec(conn, "mkdir -p /etc/nginx/conf.d/");
      await sftpPut(conn, path.join(__dirname, "nginx.conf"), "/etc/nginx/conf.d/mayuan-quiz.conf");
    }

    const nginxTest = await sshExec(conn, "nginx -t 2>&1", { print: false });
    if (nginxTest.code === 0) {
      console.log("   ✅ Nginx 配置测试通过");
      await sshExec(conn, "nginx -s reload 2>&1 || systemctl restart nginx 2>&1 || /etc/init.d/nginx reload 2>&1");
      console.log("   ✅ Nginx 已重载");
    } else {
      console.log(`   ⚠ Nginx 测试未通过（可能已有正确配置）:`);
      console.log(`   ${nginxTest.stderr.slice(-200)}`);
    }

    // ============================================================
    // Step 7: 收尾配置
    // ============================================================
    console.log("\n" + "━".repeat(50));
    console.log("⚙ Step 7: 收尾配置\n");

    // 7.1 写入 ADMIN_TOKEN
    const adminToken = env.ADMIN_TOKEN || "mayuan-admin-2026-secure";
    console.log("7.1 配置 ADMIN_TOKEN...");
    await sshExec(conn,
      `cd ${DEPLOY_DIR} && ` +
      `grep -q 'ADMIN_TOKEN' .env 2>/dev/null && ` +
      `sed -i 's/^ADMIN_TOKEN=.*/ADMIN_TOKEN=${adminToken}/' .env || ` +
      `echo 'ADMIN_TOKEN=${adminToken}' >> .env && ` +
      `echo '   ADMIN_TOKEN 已配置'`
    );

    // 7.2 清理 Nginx 代理缓存
    console.log("7.2 清理 Nginx 代理缓存...");
    await sshExec(conn, "rm -rf /www/server/nginx/proxy_cache_dir/* 2>/dev/null; echo '   缓存已清理'");

    // 7.3 重启 PM2
    console.log("7.3 重启 PM2 使新代码生效...");
    await sshExec(conn, "pm2 restart mayuan-quiz 2>&1");

    // ============================================================
    // Step 8: 验证
    // ============================================================
    console.log("\n" + "━".repeat(50));
    console.log("✅ Step 8: 验证部署\n");

    console.log("8.1 PM2 状态:");
    await sshExec(conn, "pm2 status 2>&1");

    console.log("\n8.2 服务端口检测:");
    const portCheck = await sshExec(conn,
      `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/ 2>&1 || echo 'FAIL'`,
      { print: false }
    );
    console.log(`   本地 ${PORT} 端口: HTTP ${portCheck.stdout.trim() === "200" ? "200 ✅" : portCheck.stdout.trim()}`);

    const nginxCheck2 = await sshExec(conn,
      "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80/ 2>&1 || echo 'FAIL'",
      { print: false }
    );
    console.log(`   Nginx 80 端口: HTTP ${nginxCheck2.stdout.trim() === "200" ? "200 ✅" : nginxCheck2.stdout.trim()}`);

    // ============================================================
    // 完成
    // ============================================================
    console.log("\n" + "═".repeat(50));
    console.log("🎉 部署完成！");
    console.log("═".repeat(50));
    console.log("");
    console.log(`  🌍 刷题平台: http://${SERVER_IP}`);
    console.log(`  🔐 管理后台: http://${SERVER_IP}/admin-dashboard`);
    console.log(`     Token: ${env.ADMIN_TOKEN || "mayuan-admin-2026-secure"}`);
    console.log("");
    console.log("  📋 常用命令 (SSH 到服务器后):");
    console.log("     pm2 status              查看状态");
    console.log("     pm2 logs mayuan-quiz    查看日志");
    console.log("     pm2 restart mayuan-quiz 重启应用");
    console.log("     systemctl restart nginx 重启 Nginx");
    console.log("");

  } finally {
    conn.end();
  }

  // 清理本地打包文件
  const pkgPath = path.join(PROJECT_DIR, DEPLOY_PACKAGE);
  if (existsSync(pkgPath)) {
    require("fs").unlinkSync(pkgPath);
  }
}

main().catch((err) => {
  console.error("\n❌ 部署失败:", err.message);
  // 清理
  const pkgPath = path.join(__dirname, "..", DEPLOY_PACKAGE);
  if (existsSync(pkgPath)) require("fs").unlinkSync(pkgPath);
  process.exit(1);
});
