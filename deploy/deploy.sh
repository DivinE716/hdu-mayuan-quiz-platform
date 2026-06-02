#!/usr/bin/env bash
# ============================================================
#  马原刷题平台 · 一键部署脚本
#  目标: Alibaba Cloud Linux 3 (ECS 2vCPU / 2GiB)
#  用法: 先在项目根目录创建 .env.deploy，然后运行:
#        bash deploy/deploy.sh
# ============================================================

set -euo pipefail

# ---- 颜色输出 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---- 加载凭证 ----
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.deploy"

if [ ! -f "$ENV_FILE" ]; then
    log_error "找不到 .env.deploy 文件！"
    echo ""
    echo "请在项目根目录创建 .env.deploy 文件，内容如下："
    echo ""
    echo "  SERVER_IP=120.26.138.61"
    echo "  SERVER_USER=root"
    echo "  SSH_KEY=~/.ssh/id_rsa"
    echo ""
    echo "如果用密码登录，把 SSH_KEY 换成 SSH_PASSWORD："
    echo ""
    echo "  SERVER_IP=120.26.138.61"
    echo "  SERVER_USER=root"
    echo "  SSH_PASSWORD=你的密码"
    echo ""
    exit 1
fi

source "$ENV_FILE"

# ---- 校验必要参数 ----
: "${SERVER_IP:?请设置 SERVER_IP}"
: "${SERVER_USER:?请设置 SERVER_USER}"

DEPLOY_DIR="/var/www/mayuan-quiz"
SSH_TIMEOUT="ConnectTimeout=10"
DEPLOY_PACKAGE="deploy.tar.gz"

# ---- 构建 SSH 命令 ----
if [ -n "${SSH_KEY:-}" ]; then
    SSH_CMD="ssh -i $SSH_KEY -o $SSH_TIMEOUT"
    SCP_CMD="scp -i $SSH_KEY -o $SSH_TIMEOUT"
elif [ -n "${SSH_PASSWORD:-}" ]; then
    # 用 sshpass 处理密码
    if ! command -v sshpass &>/dev/null; then
        log_error "使用密码登录需要安装 sshpass"
        echo "  brew install sshpass       # macOS"
        echo "  apt install sshpass        # Ubuntu/Debian"
        echo "  choco install sshpass      # Windows"
        exit 1
    fi
    SSH_CMD="sshpass -p '$SSH_PASSWORD' ssh -o $SSH_TIMEOUT"
    SCP_CMD="sshpass -p '$SSH_PASSWORD' scp -o $SSH_TIMEOUT"
else
    log_error "请设置 SSH_KEY 或 SSH_PASSWORD"
    exit 1
fi

TARGET="${SERVER_USER}@${SERVER_IP}"
SSH="$SSH_CMD $TARGET"
SCP="$SCP_CMD"

# ============================================================
# Step 1: 服务器环境检查与安装
# ============================================================
log_info "=== Step 1: 服务器环境检查与安装 ==="
echo ""

log_info "1.1 检查服务器连通性..."
if ! $SSH "echo 'SSH OK'" 2>/dev/null; then
    log_error "无法连接服务器 $SERVER_IP，请检查 IP / 端口 / 防火墙（安全组需放行 22、80 端口）"
    exit 1
fi
log_ok "SSH 连接成功"

log_info "1.2 安装 Nginx..."
$SSH "
    if ! command -v nginx &>/dev/null; then
        echo '  正在安装 Nginx...'
        dnf install -y nginx 2>&1 | tail -3
        systemctl enable nginx
        systemctl start nginx
        echo '  Nginx 安装完成'
    else
        echo '  Nginx 已安装: \$(nginx -v 2>&1)'
    fi
"
log_ok "Nginx 就绪"

log_info "1.3 配置 Node.js 20..."
$SSH "
    if ! command -v node &>/dev/null; then
        echo '  正在安装 Node.js 20...'
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>&1 | tail -3
        dnf install -y nodejs 2>&1 | tail -5
        echo '  Node.js 安装完成'
    fi
    echo \"  Node: \$(node --version)\"
    echo \"  npm:  \$(npm --version)\"
"
log_ok "Node.js 就绪"

log_info "1.4 安装 PM2..."
$SSH "
    if ! command -v pm2 &>/dev/null; then
        echo '  正在全局安装 PM2...'
        npm install -g pm2 2>&1 | tail -3
    else
        echo '  PM2 已安装: \$(pm2 --version)'
    fi
"
log_ok "PM2 就绪"

# ============================================================
# Step 2: 本地打包
# ============================================================
echo ""
log_info "=== Step 2: 本地构建并打包 ==="

cd "$PROJECT_DIR"

log_info "2.1 本地构建项目..."
npm run build
log_ok "构建完成"

log_info "2.2 打包文件..."
tar -czf "$DEPLOY_PACKAGE" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.next/cache' \
    --exclude='deploy.tar.gz' \
    .next \
    public \
    prisma \
    package.json \
    package-lock.json \
    next.config.ts \
    tsconfig.json \
    postcss.config.mjs \
    eslint.config.mjs \
    .env \
    deploy/ecosystem.config.js \
    2>/dev/null

PACKAGE_SIZE=$(du -h "$DEPLOY_PACKAGE" | cut -f1)
log_ok "打包完成 (${PACKAGE_SIZE})"

# ============================================================
# Step 3: 上传到服务器
# ============================================================
echo ""
log_info "=== Step 3: 传输文件到服务器 ==="

log_info "3.1 上传压缩包..."
$SCP "$DEPLOY_PACKAGE" "${TARGET}:/tmp/$DEPLOY_PACKAGE"
log_ok "上传完成"

log_info "3.2 服务器端解压..."
$SSH "
    mkdir -p $DEPLOY_DIR/logs
    rm -rf $DEPLOY_DIR/.next $DEPLOY_DIR/public $DEPLOY_DIR/prisma $DEPLOY_DIR/deploy
    tar -xzf /tmp/$DEPLOY_PACKAGE -C $DEPLOY_DIR/
    rm -f /tmp/$DEPLOY_PACKAGE
    echo '  文件已解压到 $DEPLOY_DIR'
"
log_ok "解压完成"

# ============================================================
# Step 4: 服务器端安装
# ============================================================
echo ""
log_info "=== Step 4: 服务器端安装依赖与数据库 ==="

log_info "4.1 安装生产依赖..."
$SSH "
    cd $DEPLOY_DIR
    npm install --production 2>&1 | tail -5
"
log_ok "依赖安装完成"

log_info "4.2 同步数据库..."
$SSH "
    cd $DEPLOY_DIR
    npx prisma db push --skip-generate 2>&1
    npx prisma generate 2>&1
"
log_ok "数据库同步完成"

# ============================================================
# Step 5: PM2 启动
# ============================================================
echo ""
log_info "=== Step 5: PM2 启动服务 ==="

log_info "5.1 启动/重启应用..."
$SSH "
    cd $DEPLOY_DIR
    if pm2 list | grep -q mayuan-quiz; then
        pm2 restart mayuan-quiz 2>&1
        echo '  应用已重启'
    else
        pm2 start deploy/ecosystem.config.js 2>&1
        echo '  应用已启动'
    fi
    pm2 save
"
log_ok "PM2 启动完成"

log_info "5.2 配置 PM2 开机自启..."
$SSH "
    pm2 startup systemd -u root --hp /root 2>&1 | grep -v '^$' || true
"
log_ok "开机自启已配置"

# ============================================================
# Step 6: Nginx 配置
# ============================================================
echo ""
log_info "=== Step 6: Nginx 反向代理配置 ==="

log_info "6.1 上传 Nginx 配置..."
$SCP "$SCRIPT_DIR/nginx.conf" "${TARGET}:/etc/nginx/conf.d/mayuan-quiz.conf"
log_ok "Nginx 配置已上传"

log_info "6.2 测试 Nginx 配置..."
$SSH "nginx -t 2>&1"
log_ok "Nginx 配置测试通过"

log_info "6.3 重启 Nginx..."
$SSH "systemctl restart nginx 2>&1"
log_ok "Nginx 已重启"

# ============================================================
# Step 7: 验证
# ============================================================
echo ""
log_info "=== Step 7: 验证部署 ==="

sleep 2

log_info "7.1 检查 PM2 状态..."
$SSH "pm2 status 2>&1"

echo ""
log_info "7.2 检查本地 3000 端口..."
$SSH "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>&1 || echo 'N/A'"

echo ""
log_info "7.3 检查 Nginx 80 端口..."
$SSH "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80/ 2>&1 || echo 'N/A'"

# ============================================================
# 清理本地打包文件
# ============================================================
rm -f "$PROJECT_DIR/$DEPLOY_PACKAGE"

echo ""
echo "============================================"
log_ok "🎉 部署完成！"
echo ""
echo "  访问地址: http://${SERVER_IP}"
echo "  PM2 管理: $SSH pm2 status"
echo "  查看日志: $SSH pm2 logs mayuan-quiz"
echo "  重启服务: $SSH pm2 restart mayuan-quiz"
echo ""
echo "  ⚠ 阿里云 ECS 安全组需放行: 22, 80 端口"
echo "============================================"
