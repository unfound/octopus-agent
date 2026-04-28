/**
 * 05 - 带 RAG 的交互式对话
 *
 * 启动后可以和 Agent 对话，它会从知识库中检索相关信息来回答。
 *
 * 运行方式：npx tsx src/05-rag/chat.ts
 *
 * 测试方式：
 *   1. 先索引一个文档：/index path/to/your/file.txt
 *   2. 问一个和文档相关的问题
 *   3. Agent 会用 searchKnowledge 工具检索，然后基于检索结果回答
 *
 *   快速测试（不带文件）：
 *     /demo — 加载内置示例文档
 *     然后问「Octopus Agent 是什么？」
 */

import { Agent } from "./agent";
import { interactiveChat } from "../shared/interactive";
import { createFileLogHooks } from "../shared/hooks";

const MODEL_ID = "local/qwen/qwen3.5-9b";
const STORE_PATH = "/tmp/octopus-agent/vectors.jsonl";

/** 内置示例文档 */
const DEMO_DOC = `
# Agent Learning

Agent Learning 是一个从零搭建 AI Agent 的学习项目。
基于 Vercel AI SDK 用 TypeScript 实现，不依赖高层框架。

## 核心章节

- 01-basic-agent: 单轮和持续对话，理解 LLM 调用基础
- 02-tool-system: 工具调用 + ReAct 循环，让 Agent 能执行动作
- 03-memory: 对话历史管理 + 窗口策略，控制上下文长度
- 04-long-term: 长期记忆 + BM25 检索，跨 session 记住用户
- 05-rag: 检索增强生成，让 Agent 能查阅外部文档
- 06-mcp: MCP 协议，标准化工具接入
- 07-skill: 可复用技能系统
- 08-multi-agent: 多 Agent 协作
- 09-evaluation: 评估框架

## 设计理念

每一步都理解代码在做什么。不接受"配置一下就行"的高层框架，
选择 Vercel AI SDK 因为它只提供砖头不提供房子。

## 技术栈

- 模型通信: Vercel AI SDK (ai + @ai-sdk/openai)
- 类型校验: Zod
- 语言: TypeScript
- 测试: Vitest
`;

async function main() {
  // 启用文件日志
  const hooks = createFileLogHooks({ prefix: "05-rag" });

  const agent = new Agent({ model: MODEL_ID, storePath: STORE_PATH, hooks });
  await agent.init();

  // 支持命令行参数直接索引文件
  const filesToIndex = process.argv.slice(2);
  for (const file of filesToIndex) {
    if (file.startsWith("/")) continue; // 跳过标志
    try {
      const count = await agent.indexFile(file);
      console.log(`📄 已索引: ${file} (${count} 个切片)`);
    } catch (err) {
      console.log(`❌ 索引失败: ${file} — ${(err as Error).message}`);
    }
  }

  const stats = agent.getStats();
  const indexed = stats.indexedChunks > 0
    ? `\n   📚 已索引 ${stats.indexedChunks} 个切片`
    : "\n   📚 知识库为空，用 /index <文件> 索引文档，或 /demo 加载示例";

  await interactiveChat(
    async (msg) => {
      // 特殊命令
      if (msg === "/demo") {
        const count = await agent.indexText(DEMO_DOC, "agent-learning-overview.md");
        return `✅ 已加载示例文档 (${count} 个切片)。现在可以问关于 Agent Learning 的问题了！`;
      }

      if (msg.startsWith("/index ")) {
        const filePath = msg.slice(7).trim();
        try {
          const count = await agent.indexFile(filePath);
          return `✅ 已索引: ${filePath} (${count} 个切片)`;
        } catch (err) {
          return `❌ 索引失败: ${(err as Error).message}`;
        }
      }

      return agent.send(msg);
    },
    {
      welcome: `🐙 05 - 带 RAG 的 Agent
   从知识库检索相关文档来辅助回答${indexed}
   /index <文件> 索引文档 | /demo 加载示例 | /exit 退出\n`,
    },
  );

  console.log("📊 最终统计:", agent.getStats());
}

main().catch(console.error);
