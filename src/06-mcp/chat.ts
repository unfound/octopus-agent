/**
 * 06 - MCP 交互式对话
 *
 * 演示可插拔的 MCP 架构：
 *   1. 从配置文件声明 MCP Servers
 *   2. 动态加载所有 servers 的 tools
 *   3. Agent 只接收 tools，不关心来源
 *
 * 运行方式：npx tsx src/06-mcp/chat.ts [配置文件路径]
 *
 * 默认读取 src/06-mcp/mcp-servers.json
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateText, type ModelMessage, type ToolCallPart, type ToolResultPart, type JSONValue } from "ai";
import { getModel } from "../shared/model";
import { loadFromConfig } from "./mcp-loader.js";

const MODEL_ID = "local/qwen/qwen3.5-9b";

const SYSTEM_PROMPT = `你是一个助手，可以使用工具来操作文件系统。
可用工具由 MCP Server 提供。
使用原则：
- 操作前先查看当前状态
- 写入文件时确认路径正确
- 执行命令注意安全`;

async function main() {
  // ══════════════════════════════════════════
  // 1. 从配置文件加载 MCP Servers
  // ══════════════════════════════════════════
  const configPath = process.argv[2] ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "mcp-servers.json");

  console.log(`📄 配置文件: ${configPath}`);

  const { tools, close } = await loadFromConfig(configPath);

  // ══════════════════════════════════════════
  // 2. 交互循环
  // ══════════════════════════════════════════
  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log("\n🐙 06 - MCP Agent 启动！");
  console.log("   MCP Servers 通过配置文件声明，Agent 动态加载");
  console.log("   /exit 退出\n");

  try {
    while (true) {
      let input: string;
      try {
        input = await rl.question("你: ");
      } catch {
        break;
      }

      if (input.trim() === "/exit") break;
      if (!input.trim()) continue;

      const messages: ModelMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input },
      ];

      for (let step = 0; step < 10; step++) {
        const result = await generateText({
          model: getModel(MODEL_ID),
          messages,
          tools,
        });

        if (!result.toolCalls || result.toolCalls.length === 0) {
          console.log(`🐙: ${result.text}\n`);
          break;
        }

        const assistantParts: Array<{ type: "text"; text: string } | ToolCallPart> = [];
        if (result.text) assistantParts.push({ type: "text", text: result.text });
        for (const tc of result.toolCalls) {
          console.log(`  🔧 ${tc.toolName}(${JSON.stringify(tc.input)})`);
          assistantParts.push({
            type: "tool-call",
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.input,
          });
        }
        messages.push({ role: "assistant", content: assistantParts });

        const toolResultParts: ToolResultPart[] = result.toolResults.map((tr) => ({
          type: "tool-result" as const,
          toolCallId: tr.toolCallId,
          toolName: tr.toolName,
          output: { type: "json" as const, value: tr.output as JSONValue },
        }));
        messages.push({ role: "tool", content: toolResultParts });
      }
    }
  } finally {
    rl.close();
    await close();
    console.log("👋 再见！");
  }
}

main().catch(console.error);
