/**
 * 13-structured-output — Zod Schema 定义
 *
 * 演示各种结构化输出场景的 Schema：
 * 1. 代码审查 — 从代码中提取 Issues
 * 2. 信息提取 — 从文本中提取结构化信息
 * 3. 分类器 — 将输入分类到预定类别
 * 4. 实体提取 — 抽取人名/地名/组织
 */

import { z } from "zod";

// ====== Schema 1: 代码审查 ======

/** 问题严重级别 */
export const SeverityEnum = z.enum(["error", "warning", "info"]);
export type Severity = z.infer<typeof SeverityEnum>;

/** 问题类别 */
export const CategoryEnum = z.enum(["bug", "style", "performance", "security", "type"]);
export type Category = z.infer<typeof CategoryEnum>;

/** 单个代码问题 */
export const IssueSchema = z.object({
  line: z.number().describe("问题所在行号"),
  severity: SeverityEnum.describe("问题严重级别"),
  category: CategoryEnum.describe("问题类别"),
  message: z.string().describe("问题描述"),
  suggestion: z.string().optional().describe("修复建议"),
});
export type Issue = z.infer<typeof IssueSchema>;

/** 代码审查结果 */
export const CodeReviewSchema = z.object({
  summary: z.string().describe("代码整体评估（一段话）"),
  issues: z.array(IssueSchema).describe("发现的问题列表"),
  score: z.number().min(1).max(10).describe("代码质量评分（1-10）"),
  strengths: z.array(z.string()).describe("代码优点"),
});
export type CodeReview = z.infer<typeof CodeReviewSchema>;

// ====== Schema 2: 信息提取 ======

/** 从邮件文本中提取结构化信息 */
export const EmailExtractSchema = z.object({
  sender: z.string().describe("发件人姓名"),
  subject: z.string().describe("邮件主题（推断）"),
  urgency: z.enum(["low", "medium", "high"]).describe("紧急程度"),
  actionItems: z.array(z.string()).describe("需要执行的操作"),
  deadline: z.string().optional().describe("截止日期（如果有）"),
});
export type EmailExtract = z.infer<typeof EmailExtractSchema>;

// ====== Schema 3: 分类器 ======

/** 用户消息意图分类 */
export const IntentSchema = z.object({
  intent: z.enum([
    "question",       // 提问
    "command",        // 指令
    "complaint",      // 投诉
    "feedback",       // 反馈
    "greeting",       // 问候
    "other",          // 其他
  ]).describe("用户意图"),
  confidence: z.number().min(0).max(1).describe("置信度"),
  topics: z.array(z.string()).describe("涉及的话题"),
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("情感倾向"),
});
export type Intent = z.infer<typeof IntentSchema>;

// ====== Schema 4: 实体提取 ======

/** 从文本中提取命名实体 */
export const EntityExtractSchema = z.object({
  people: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
  })).describe("人物"),
  organizations: z.array(z.string()).describe("组织/公司"),
  locations: z.array(z.string()).describe("地点"),
  dates: z.array(z.string()).describe("日期/时间"),
  technologies: z.array(z.string()).describe("提到的技术/工具"),
});
export type EntityExtract = z.infer<typeof EntityExtractSchema>;
