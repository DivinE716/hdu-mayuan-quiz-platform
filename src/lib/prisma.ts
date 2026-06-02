import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// ============================================================
// SQLite 性能调优：WAL 模式 + 繁忙超时
//
// WAL (Write-Ahead Logging)：
//   读写互不阻塞——多人同时刷题时，一个人写入不会锁住其他人的读取
//   默认的 DELETE 模式下，写操作会锁住整个数据库
//
// busy_timeout：
//   当数据库被锁时，等待 5000ms 再重试，而非立即报 "database is locked"
//   SQLite 默认行为是立即返回 BUSY 错误
// ============================================================

prisma
  .$executeRawUnsafe("PRAGMA journal_mode=WAL;")
  .catch(() => { /* 首次连接可能尚未建立，下次自动重试 */ });

prisma
  .$executeRawUnsafe("PRAGMA busy_timeout=5000;")
  .catch(() => {});
