/**
 * 用户确认机制 — 危险操作前暂停
 *
 * Agent 调用工具时，如果是危险操作，暂停等待用户确认
 *
 * 两种模式：
 * 1. 交互式 — readline 等待用户输入 y/n
 * 2. 自动化 — 预设规则，自动放行/拒绝
 */

import { createInterface } from "node:readline";

/** 确认结果 */
export type ConfirmResult = "allow" | "deny" | "always-allow";

/** 确认信息 */
export interface ConfirmInfo {
  toolName: string;
  input: unknown;
  timestamp: number;
}

/**
 * 请求用户确认（交互式）
 *
 * 用法：
 * ```typescript
 * const result = await askConfirm("exec", { command: "rm -rf /tmp" });
 * if (result === "deny") throw new Error("用户拒绝");
 * ```
 */
export async function askConfirm(toolName: string, input: unknown): Promise<ConfirmResult> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((r) => rl.question(q, r));

  console.log("\n" + "═".repeat(50));
  console.log(`⚠️  需要确认：工具 "${toolName}"`);
  console.log("═".repeat(50));

  const inputStr = typeof input === "string"
    ? input
    : JSON.stringify(input, null, 2);
  console.log(`\n输入参数:\n${inputStr}`);

  console.log("\n选项：");
  console.log("  y — 允许执行");
  console.log("  n — 拒绝执行");
  console.log("  a — 本次会话始终允许此工具");

  const answer = await ask("\n你的选择 [y/n/a]: ");
  rl.close();

  const normalized = answer.trim().toLowerCase();
  if (normalized === "a") return "always-allow";
  if (normalized === "y" || normalized === "yes") return "allow";
  return "deny";
}

/**
 * 自动确认器（用于非交互场景）
 *
 * 用法：
 * ```typescript
 * const confirm = createAutoConfirm("allow-all");
 * const result = await confirm("exec", { command: "ls" }); // 返回 "allow"
 * ```
 */
export function createAutoConfirm(
  policy: "allow-all" | "deny-all" | ((toolName: string, input: unknown) => ConfirmResult),
): (toolName: string, input: unknown) => Promise<ConfirmResult> {
  if (policy === "allow-all") return async () => "allow";
  if (policy === "deny-all") return async () => "deny";
  return async (toolName, input) => policy(toolName, input);
}
