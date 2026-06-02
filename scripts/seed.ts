/**
 * seed.ts — 解析 quiz_pool.txt 并批量导入 SQLite 数据库
 *
 * 运行方式: npx tsx scripts/seed.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ============================================================
// 类型定义
// ============================================================

interface ParsedQuestion {
  type: "single" | "multiple" | "judge";
  questionText: string;
  options: string;      // JSON string: {"A":"...","B":"..."}
  answer: string;       // JSON array: ["A"] or ["A","B"]
  analysisText: string; // 暂时留空
}

// ============================================================
// 工具函数
// ============================================================

/** 清洗文本：去除行首尾空白、合并多余空白 */
function cleanText(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 从 "A、 xxx" 或 "A、xxx" 格式中提取选项文本 */
function parseOptionLine(line: string): { key: string; text: string } | null {
  const match = line.match(/^([A-Z])、\s*(.+)$/);
  if (!match) return null;
  return {
    key: match[1],
    text: cleanText(match[2]),
  };
}

// ============================================================
// 核心解析逻辑
// ============================================================

function parseQuizFile(filePath: string): ParsedQuestion[] {
  const raw = readFileSync(filePath, "utf-8");
  const questions: ParsedQuestion[] = [];

  // --- 1. 按题型章节拆分 ---
  // 章节标题行形如: "一、 单选题 （共441题，40分）"
  const sectionRegex = /([一二三四五六七八九十]+)、\s*(单选题|多选题|判断题)[^\n]*\n/g;
  const sections: { typeLabel: string; start: number; end: number }[] = [];
  let sectionMatch: RegExpExecArray | null;

  while ((sectionMatch = sectionRegex.exec(raw)) !== null) {
    sections.push({
      typeLabel: sectionMatch[2],
      start: sectionMatch.index + sectionMatch[0].length,
      end: raw.length,
    });
  }

  // 修正每个 section 的 end 为下一个 section 的 start
  for (let i = 0; i < sections.length - 1; i++) {
    sections[i].end = sections[i + 1].start;
  }
  sections[sections.length - 1].end = raw.length;

  if (sections.length === 0) {
    console.error("❌ 未找到任何章节标题（单选题/多选题/判断题）");
    return [];
  }

  // --- 2. 逐章节解析 ---
  for (const section of sections) {
    const sectionText = raw.slice(section.start, section.end);
    const sectionQuestions = parseSection(sectionText, section.typeLabel);
    questions.push(...sectionQuestions);
    console.log(
      `   📂 ${section.typeLabel}: 解析到 ${sectionQuestions.length} 道题`
    );
  }

  return questions;
}

/**
 * 解析一个章节内的所有题目
 */
function parseSection(
  sectionText: string,
  typeLabel: string
): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];

  // 将章节文本按题目编号拆分（以行首数字+顿号为标志）
  const questionBlocks = splitQuestionBlocks(sectionText);

  for (const block of questionBlocks) {
    const q = parseOneBlock(block, typeLabel);
    if (q) {
      questions.push(q);
    }
  }

  return questions;
}

/**
 * 将章节文本按 "数字、" 行首拆分为题目块
 */
function splitQuestionBlocks(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split(/\r?\n/);
  let currentBlock = "";
  let inBlock = false;

  for (const line of lines) {
    // 检测题目起始行: 纯数字 + 、
    const questionStartMatch = line.match(/^\s*(\d+)、/);

    if (questionStartMatch && !inBlock) {
      // 第一个题目开始
      inBlock = true;
      currentBlock = line;
    } else if (questionStartMatch && inBlock) {
      // 新题目开始 -> 保存上一个
      blocks.push(currentBlock.trim());
      currentBlock = line;
    } else if (inBlock) {
      currentBlock += "\n" + line;
    }
    // 忽略章节标题行和其他无关行
  }

  // 保存最后一个
  if (inBlock && currentBlock.trim()) {
    blocks.push(currentBlock.trim());
  }

  return blocks;
}

/**
 * 解析单个题目块
 */
function parseOneBlock(
  block: string,
  typeLabel: string
): ParsedQuestion | null {
  const lines = block.split(/\r?\n/);

  // --- 提取题目编号和文本 ---
  const firstLine = lines[0];
  const questionNumMatch = firstLine.match(/^\s*(\d+)、\s*(.*)/);
  if (!questionNumMatch) return null;

  const questionTextLines: string[] = [];
  const options: { key: string; text: string }[] = [];
  let answerText = "";
  let foundAnswer = false;

  // 第一行除去编号后的文本
  const firstLineRest = cleanText(questionNumMatch[2]);
  if (firstLineRest) {
    questionTextLines.push(firstLineRest);
  }

  // --- 逐行解析 ---
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 答案行
    const answerMatch = line.match(/^正确答案：\s*(.+)$/);
    if (answerMatch) {
      answerText = answerMatch[1].trim();
      foundAnswer = true;
      continue;
    }

    // 选项行
    const optMatch = parseOptionLine(line);
    if (optMatch) {
      options.push(optMatch);
      continue;
    }

    // 不是答案也不是选项，那就是题目文本的延续行
    if (!foundAnswer) {
      questionTextLines.push(cleanText(line));
    }
  }

  // --- 确定题型 ---
  const type = determineType(typeLabel, options, answerText);
  if (!type) return null;

  // --- 构建标准选项 JSON ---
  const optionsJson = buildOptionsJson(type, options, answerText);

  // --- 构建标准答案 JSON ---
  const answerJson = buildAnswerJson(type, answerText, options);

  return {
    type,
    questionText: questionTextLines.join(" "),
    options: optionsJson,
    answer: answerJson,
    analysisText: "", // 题库中无解析，后续可补充
  };
}

/**
 * 自动识别题型
 *  - 判断题：章节为判断题，或只有 A/B 两个选项
 *  - 单选题：正确答案为单个字母
 *  - 多选题：正确答案为多个字母
 */
function determineType(
  typeLabel: string,
  options: { key: string; text: string }[],
  answerText: string
): "single" | "multiple" | "judge" | null {
  // 判断题章节
  if (typeLabel === "判断题") return "judge";

  // 正确/错误 → 判断题
  if (answerText === "正确" || answerText === "错误") return "judge";

  // 多选题章节
  if (typeLabel === "多选题") return "multiple";

  // 单选题章节
  if (typeLabel === "单选题") return "single";

  // 自动判断
  const letters = answerText.replace(/[^A-Za-z]/g, "").toUpperCase();
  if (letters.length === 0) return null;
  if (letters.length === 1) return "single";
  return "multiple";
}

/**
 * 构建标准选项 JSON 字符串
 * 判断题统一为 {"A":"正确","B":"错误"}
 */
function buildOptionsJson(
  type: string,
  options: { key: string; text: string }[],
  answerText: string
): string {
  if (type === "judge") {
    return JSON.stringify({ A: "正确", B: "错误" });
  }

  const obj: Record<string, string> = {};
  for (const opt of options) {
    obj[opt.key] = opt.text;
  }
  return JSON.stringify(obj);
}

/**
 * 构建标准答案 JSON 数组字符串
 * 判断题: 正确→["A"], 错误→["B"]
 * 单选题: ["C"]
 * 多选题: ["A","B","D"]
 */
function buildAnswerJson(
  type: string,
  answerText: string,
  _options: { key: string; text: string }[]
): string {
  if (type === "judge") {
    if (answerText === "正确" || answerText === "A" || answerText === "对") {
      return JSON.stringify(["A"]);
    }
    return JSON.stringify(["B"]);
  }

  // 提取所有大写字母
  const letters = answerText.replace(/[^A-Za-z]/g, "").toUpperCase().split("");
  return JSON.stringify(letters);
}

// ============================================================
// 数据库写入
// ============================================================

async function importToDatabase(questions: ParsedQuestion[]): Promise<void> {
  console.log(`\n📝 正在写入数据库...`);

  let inserted = 0;
  let skipped = 0;

  // 分批写入，每批 50 道
  const BATCH_SIZE = 50;

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);

    for (const q of batch) {
      try {
        await prisma.question.create({
          data: {
            type: q.type,
            questionText: q.questionText,
            options: q.options,
            answer: q.answer,
            analysisText: q.analysisText,
          },
        });
        inserted++;
      } catch (err: any) {
        console.error(`   ⚠ 插入失败: ${q.questionText.slice(0, 40)}...`, err.message);
        skipped++;
      }
    }

    const progress = Math.min(i + BATCH_SIZE, questions.length);
    console.log(`   ✅ ${progress}/${questions.length} 道已处理`);
  }

  console.log(`\n🎉 导入完成！成功: ${inserted}，跳过: ${skipped}`);
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const filePath = resolve(process.cwd(), "quiz_pool.txt");

  console.log("📖 正在读取题库文件...");
  console.log(`   ${filePath}\n`);

  // 解析
  const questions = parseQuizFile(filePath);

  if (questions.length === 0) {
    console.error("❌ 未解析到任何题目，请检查文件格式。");
    process.exit(1);
  }

  // 统计
  const singles = questions.filter((q) => q.type === "single").length;
  const multiples = questions.filter((q) => q.type === "multiple").length;
  const judges = questions.filter((q) => q.type === "judge").length;

  console.log(`\n📊 解析统计:`);
  console.log(`   单选题: ${singles} 道`);
  console.log(`   多选题: ${multiples} 道`);
  console.log(`   判断题: ${judges} 道`);
  console.log(`   合计:   ${questions.length} 道`);

  // 入库前清空旧数据
  console.log(`\n🗑 清空旧数据...`);
  await prisma.userProgress.deleteMany();
  await prisma.question.deleteMany();
  console.log(`   旧数据已清除。`);

  // 写入
  await importToDatabase(questions);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ 脚本执行失败:", err);
  prisma.$disconnect();
  process.exit(1);
});
