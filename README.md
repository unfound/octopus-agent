# 🐙 Agent Learning

> 从零搭建 AI Agent — 基于 Vercel AI SDK 的 TypeScript 学习项目

## 📖 项目简介

不依赖高层框架（Mastra、LangChain），用 **Vercel AI SDK** 做底层通信，自己实现 Agent 的核心机制。

目标：**每一步都理解代码在做什么。**

## 🛤️ 章节

| # | 章节 | 描述 | 状态 |
|---|------|------|:----:|
| 01 | [basic-agent](./src/01-basic-agent/) | 单轮 / 持续对话 — 最简 Agent | ✅ |
| 02 | [tool-system](./src/02-tool-system/) | 工具调用 + ReAct 循环 | ✅ |
| 03 | [memory](./src/03-memory/) | 对话历史 + 窗口策略 | ✅ |
| 04 | [long-term](./src/04-long-term/) | 长期记忆 — JSONL + BM25 检索 | ✅ |
| 05 | [rag](./src/05-rag/) | 检索增强生成 — 切片 + embedding + 向量检索 | ✅ |
| 06 | [mcp](./src/06-mcp/) | MCP 协议 — 标准化工具/资源接入 | ✅ |
| 07 | [skill](./src/07-skill/) | 可复用技能 — 发现、加载、执行 | ✅ |
| 08 | [sub-agent](./src/08-sub-agent/) | 子代理委派 — 隔离上下文 + MoA | ✅ |
| 09 | [multi-agent](./src/09-multi-agent/) | 对等协作 — MessageBus + Handoff | ✅ |
| 10 | [sandbox](./src/10-sandbox/) | 安全沙箱 — 白名单 + 脱敏 + 确认 | ✅ |
| 11 | [evaluation](./src/11-evaluation/) | 评估框架 — 关键词 + LLM Judge | ✅ |
| 12 | [streaming](./src/12-streaming/) | 流式输出 — streamText + fullStream | ✅ |
| 13 | [structured-output](./src/13-structured-output/) | 结构化输出 — generateObject + Zod | ✅ |
| 14 | [error-handling](./src/14-error-handling/) | 容错 — retry + fallback + 降级 | ✅ |

所有章节都可以用 `npx tsx src/<章节>/chat.ts` 运行，部分支持子命令：

```bash
# 08: 子代理模式
npx tsx src/08-sub-agent/chat.ts subagent   # 基础 SubAgent
npx tsx src/08-sub-agent/chat.ts delegate   # 父代理 + delegate
npx tsx src/08-sub-agent/chat.ts moa        # Mixture-of-Agents

# 09: 多 Agent 模式
npx tsx src/09-multi-agent/chat.ts handoff   # Handoff 转交
npx tsx src/09-multi-agent/chat.ts collab    # Researcher + Writer 协作

# 12: 流式模式
npx tsx src/12-streaming/chat.ts text        # 纯文本流
npx tsx src/12-streaming/chat.ts full        # 完整事件流
npx tsx src/12-streaming/chat.ts tool        # 工具调用流
npx tsx src/12-streaming/chat.ts benchmark   # 延迟对比

# 13: 结构化模式
npx tsx src/13-structured-output/chat.ts review     # 代码审查
npx tsx src/13-structured-output/chat.ts extract    # 信息提取
npx tsx src/13-structured-output/chat.ts classify   # 意图分类
npx tsx src/13-structured-output/chat.ts entities   # 实体提取
npx tsx src/13-structured-output/chat.ts stream     # 流式审查

# 14: 容错模式
npx tsx src/14-error-handling/chat.ts classify    # 错误分类演示
npx tsx src/14-error-handling/chat.ts retry       # 重试机制演示
npx tsx src/14-error-handling/chat.ts fallback    # 模型降级演示
npx tsx src/14-error-handling/chat.ts resilient   # 完整容错
npx tsx src/14-error-handling/chat.ts stats       # 错误统计
```

## 🏗️ 目录结构

```
agent-learning/
├── src/
│   ├── shared/              # 共享模块
│   │   ├── model.ts         # 模型配置（OpenRouter / 本地模型）
│   │   ├── message-store.ts # 消息存储 + token 估算
│   │   ├── interactive.ts   # 交互式对话循环（readline）
│   │   ├── base-agent.ts    # 共享 Agent 基类（ReAct 循环 + hooks）
│   │   ├── hooks.ts         # hooks 系统 + emitStepsHooks 共享函数
│   │   └── trace.ts         # 调用链可视化分析工具
│   ├── 01-basic-agent/      # 单轮 / 持续对话
│   ├── 02-tool-system/      # 工具调用 + ReAct 循环
│   ├── 03-memory/           # 记忆系统 + 上下文窗口
│   ├── 04-long-term/        # 长期记忆 + BM25 检索
│   ├── 05-rag/              # 检索增强生成 — 文档切片 + embedding + 向量检索
│   ├── 06-mcp/              # MCP 协议 — Server/Client/工具转换
│   ├── 07-skill/            # 可复用技能系统
│   ├── 08-sub-agent/        # 子代理委派 — 隔离上下文 + MoA
│   ├── 09-multi-agent/      # 对等协作 — MessageBus + Handoff
│   ├── 10-sandbox/          # 权限控制 — 工具白名单 + 沙箱执行 + 敏感信息过滤
│   ├── 11-evaluation/       # 评估框架 — 关键词校验 + LLM Judge + 回归测试
│   ├── 12-streaming/        # 流式输出 — streamText + textStream + fullStream
│   ├── 13-structured-output/ # 结构化输出 — generateObject + Zod Schema
│   └── 14-error-handling/   # 错误处理 — retry + fallback + 容错
├── tests/                   # 测试（含各章节集成测试）
├── .env                     # API keys（不提交）
└── package.json
```

## 🚀 快速开始

### 环境要求

- Node.js 20+

### 安装

```bash
cd agent-learning
npm install
```

### 配置

复制 `.env.example` 为 `.env`，填入 API key：

```bash
cp .env.example .env
```

默认使用本地模型（LM Studio @ 192.168.0.120:8888）。

### 运行示例

```bash
# 第一章：单轮对话
npx tsx src/01-basic-agent/index.ts

# 交互模式（多轮对话）
npx tsx src/01-basic-agent/chat.ts
npx tsx src/02-tool-system/chat.ts
npx tsx src/03-memory/chat.ts
npx tsx src/04-long-term/chat.ts
npx tsx src/05-rag/chat.ts
npx tsx src/06-mcp/chat.ts
npx tsx src/07-skill/chat.ts
```

### 测试

```bash
npm test                      # 全部测试
npx vitest run tests/02-agent-integration.test.ts  # 工具集成测试
npx vitest run tests/03-memory.test.ts              # 记忆系统测试
npx vitest run tests/04-long-term.test.ts           # 长期记忆测试
```

### 调试与分析

#### Trace Viewer — 日志可视化

`src/shared/trace.ts` 读取 hooks 生成的 JSON 日志，输出调用链树状图。

```bash
# 基本用法：查看调用链
npx tsx src/shared/trace.ts logs/agent-session.json

# 详细模式：展开 messages
npx tsx src/shared/trace.ts logs/agent-session.json --verbose

# JSON 模式：输出结构化数据（方便脚本处理）
npx tsx src/shared/trace.ts logs/agent-session.json --json
```

**使用场景：**

1. **调试 Agent 行为** — 查看每轮调用的输入输出、工具调用参数
2. **Token 用量分析** — 统计每次调用的 token 消耗，找出优化点
3. **多 Agent 调试** — sub-agent / multi-agent 场景下调用树可视化
4. **性能分析** — 识别耗时长的调用，优化响应速度

**示例输出：**

```
━━━━━━━━━━━━━━━ Trace: agent-session.json ━━━━━━━━━━━━━━━

  agent        #1 ✅ "研究 TypeScript 的优势..." [read_file×2]  1.2k tok  2.3s
  └ sub-agent  #1 ✅ "分析完成..." [web_search×1]              0.8k tok  1.5s

━━━━━━━━━━━━━━━━━ Summary ━━━━━━━━━━━━━━━━━
  agent        2 calls | in 1.5k + out 0.5k = 2.0k tok | 3.8s [read_file×2, web_search×1]
  ──────────────────────────────────────────────────
  Total        2 calls | 2.0k tok | 3.8s
```

#### Hooks 日志系统

每个 Agent 都可以配置 hooks 来记录完整的 LLM 调用：

```typescript
import { createFileLogHooks } from "./shared/hooks";

const hooks = createFileLogHooks({ prefix: "my-agent" });
const agent = new PeerAgent({ hooks, ... });

// 运行后日志自动写入 logs/my-agent-*.json
// 用 trace.ts 查看
```

## 📚 技术栈

- **模型通信**: [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` + `@ai-sdk/openai`)
- **类型校验**: Zod
- **语言**: TypeScript
- **测试**: Vitest
