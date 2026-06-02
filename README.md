# 马克思主义原理 · 线上刷题平台

**在线入口：[http://120.26.138.61](http://120.26.138.61)**

一个面向《马克思主义原理》课程的在线练习与复习平台，支持单选题、多选题、判断题三种题型，提供收藏、错题本、多端进度同步等功能。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 16 (App Router) + TypeScript |
| 样式 | Tailwind CSS 4 — 莫兰迪护眼配色 |
| 数据库 | SQLite + Prisma ORM 6 |
| 认证 | bcryptjs + JWT（Authorization Header + localStorage） |
| 部署 | 阿里云 ECS + Nginx 反向代理 + PM2 进程管理 |

## 功能模块

- **账户体系** — 注册 / 登录 / JWT 认证，支持多设备同时在线
- **三种刷题模式** — 单选题（441 道）、多选题（282 道）、判断题（423 道）
- **全部题目** — 随机打乱顺序的综合性练习
- **实时判题** — 单选/判断点击即出结果，多选题勾选后提交判题
- **收藏夹** — 收藏重点题目，跨设备同步
- **错题本** — 自动收录做错的题目，支持反复练习直到掌握
- **进度追踪** — 首页展示正确率、已掌握数、错题数、收藏数
- **多端同步** — 做题记录和刷题位置自动同步到服务器，换设备继续做

## 本地开发

```bash
# 安装依赖
npm install

# 初始化数据库
npx prisma db push

# 导入题库（1146 道题）
npx tsx scripts/seed.ts

# 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

## 项目结构

```
src/
├── app/
│   ├── page.tsx                    # 首页：进度面板 + 刷题入口
│   ├── layout.tsx                  # 根布局
│   ├── globals.css                 # 莫兰迪主题色
│   ├── login/page.tsx              # 登录页
│   ├── register/page.tsx           # 注册页
│   ├── practice/
│   │   ├── page.tsx                # 刷题页（服务端入口）
│   │   └── PracticeClient.tsx      # 核心刷题组件
│   └── api/
│       ├── auth/register/route.ts  # 注册 API
│       ├── auth/login/route.ts     # 登录 API
│       ├── questions/route.ts      # 题目列表（支持筛选、随机、分页）
│       ├── progress/sync/route.ts  # 进度同步（upsert）
│       ├── progress/stats/route.ts # 学习统计
│       └── settings/route.ts       # 用户设置（跨端位置记忆）
├── components/
│   ├── Navbar.tsx                  # 导航栏
│   ├── ModuleCard.tsx              # 首页模块入口卡片
│   └── AppLink.tsx                 # 移动端兼容导航链接
└── lib/
    ├── prisma.ts                   # Prisma Client 单例
    ├── auth.ts                     # JWT 签发/验证
    ├── password.ts                 # bcrypt 密码哈希
    ├── api.ts                      # 前端 API 调用封装
    └── api-response.ts             # 统一响应格式
```

## 数据库模型

```
User         — id, username, passwordHash, createdAt
Question     — id, type, questionText, options(JSON), answer(JSON), analysisText
UserProgress — userId, questionId, isFavorite, wrongCount, isMastered, updatedAt
UserSettings — userId, key, value（跨端位置同步）
```

## 部署

项目部署在阿里云 ECS（2 vCPU / 2 GiB），使用 Nginx + PM2：

```bash
# 创建 .env.deploy 文件填写服务器凭证，然后：
node deploy/deploy.js
```

详细说明见 `deploy/` 目录。

## License

MIT
