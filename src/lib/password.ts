import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * 对明文密码进行哈希
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * 验证明文密码与哈希是否匹配
 */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
