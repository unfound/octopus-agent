/**
 * 13-structured-output 测试
 *
 * 测试结构化输出的核心行为：
 * 1. generateObject 返回符合 Schema 的对象
 * 2. 嵌套结构正确
 * 3. safeGenerate 错误处理
 */
import { describe, it, expect } from "vitest";
import {
  reviewCode,
  extractEmail,
  classifyIntent,
  safeGenerate,
} from "../src/13-structured-output/generate";
import { IntentSchema } from "../src/13-structured-output/schemas";

const SAMPLE_CODE = `
function add(a, b) {
  return a + b;
}
`;

describe("13-structured-output", () => {
  describe("代码审查 (generateObject)", () => {
    it("应该返回结构化审查结果", { timeout: 30000 }, async () => {
      const result = await reviewCode(SAMPLE_CODE);

      // 验证顶层字段
      expect(typeof result.summary).toBe("string");
      expect(result.summary.length).toBeGreaterThan(0);

      // 验证 score 在 1-10 范围内
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(10);

      // 验证 strengths 是数组
      expect(Array.isArray(result.strengths)).toBe(true);

      // 验证 issues 结构
      expect(Array.isArray(result.issues)).toBe(true);
      if (result.issues.length > 0) {
        const issue = result.issues[0];
        expect(typeof issue.line).toBe("number");
        expect(["error", "warning", "info"]).toContain(issue.severity);
        expect(["bug", "style", "performance", "security", "type"]).toContain(issue.category);
        expect(typeof issue.message).toBe("string");
      }
    });

    it("应该能检测到明显的代码问题", { timeout: 30000 }, async () => {
      const badCode = `
function process(data: any) {
  var password = data.password;
  console.log(password);
}`;
      const result = await reviewCode(badCode);

      // 这段代码有安全隐患（打印密码）和使用 any 类型
      const hasSecurityIssue = result.issues.some(
        i => i.category === "security" || i.message.includes("密码") || i.message.includes("password")
      );
      const hasTypeIssue = result.issues.some(
        i => i.category === "type" || i.message.includes("any")
      );

      // 至少应该检测到其中一个问题
      expect(hasSecurityIssue || hasTypeIssue).toBe(true);
    });
  });

  describe("信息提取 (generateObject)", () => {
    it("应该从邮件中提取结构化信息", { timeout: 30000 }, async () => {
      const email = "发件人: 李四\n主题: 紧急！服务器宕机了\n请马上处理。明天下午 3 点前需要恢复。";
      const result = await extractEmail(email);

      expect(typeof result.sender).toBe("string");
      expect(result.sender.length).toBeGreaterThan(0);
      expect(typeof result.subject).toBe("string");
      expect(["low", "medium", "high"]).toContain(result.urgency);
      expect(Array.isArray(result.actionItems)).toBe(true);
    });
  });

  describe("意图分类 (generateObject)", () => {
    it("应该正确分类问候", { timeout: 30000 }, async () => {
      const result = await classifyIntent("你好！");
      expect(["greeting", "other"]).toContain(result.intent);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("应该正确分类问题", { timeout: 30000 }, async () => {
      const result = await classifyIntent("TypeScript 的泛型怎么用？");
      expect(result.intent).toBe("question");
    });
  });

  describe("safeGenerate (错误处理)", () => {
    it("成功时返回 success: true", { timeout: 30000 }, async () => {
      const result = await safeGenerate(
        IntentSchema,
        "分类：你好！",
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.intent).toBe("string");
      }
    });
  });
});
