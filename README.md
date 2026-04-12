# 🐙 Octopus Agent

> 从零搭建 AI Agent — 基于 Vercel AI SDK 的 TypeScript 学习项目

## 📖 项目简介

不依赖高层框架（Mastra、LangChain），用 **Vercel AI SDK** 做底层通信，自己实现 Agent 的核心机制。

目标：**每一步都理解代码在做什么。**

## 🛤️ 章节

| # | 章节 | 描述 | 运行方式 | 状态 |
|---|------|------|----------|------|
| 01 | [basic-agent](./src/01-basic-agent/) | 单轮 / 持续对话 | `npx tsx src/01-basic-agent/index.ts` (单轮) / `chat.ts` (多轮) | ✅ |
| 02 | [tool-system](./src/02-tool-system/) | 工具调用 + ReAct 循环 | `npx tsx src/02-tool-system/chat.ts` | ✅ |
| 03 | [memory](./src/03-memory/) | 对话历史 + 窗口策略 | `npx tsx src/03-memory/chat.ts` | ✅ |
| 04 | [long-term](./src/04-long-term/) | 长期记忆 + BM25 检索 | `npx tsx src/04-long-term/chat.ts` | ✅ |
| 05 | rag | 检索增强生成 — 文档切片 + embedding + 相似度检索 | — | ⬜ |
| 06 | mcp | MCP 协议 — 标准化工具/资源接入 | — | ⬜ |
| 07 | [skill](./src/07-skill/) | 可复用技能 — 技能发现、加载、执行 | `npx tsx src/07-skill/chat.ts` | ✅ |
| 08 | multi-agent | Agent 间通信 — supervisor / handoff / network | — | ⬜ |
| 09 | evaluation | 评估框架 — 自动评分 + 回归测试 | — | ⬜ |

## 🏗️ 目录结构

```
octopus-agent/
├── src/
│   ├── shared/              # 共享模块
│   │   ├── model.ts         # 模型配置（OpenRouter / 本地模型）
│   │   ├── message-store.ts # 消息存储 + token 估算
│   │   └── interactive.ts   # 交互式对话循环（readline）
│   ├── 01-basic-agent/      # 单轮 / 持续对话
│   ├── 02-tool-system/      # 工具调用 + ReAct 循环
│   ├── 03-memory/           # 记忆系统 + 上下文窗口
│   ├── 04-long-term/        # 长期记忆 + BM25 检索
│   └── 07-skill/            # 可复用技能系统
├── tests/                   # 测试（含各章节集成测试）
├── .env                     # API keys（不提交）
└── package.json
```

## 🚀 快速开始

### 环境要求

- Node.js 20+

### 安装

```bash
cd octopus-agent
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

# 第一章：多轮对话（交互式）
npx tsx src/01-basic-agent/chat.ts

# 第二章：工具调用（交互式，支持文件读写和命令执行）
npx tsx src/02-tool-system/chat.ts

# 第三章：记忆系统（交互式，能记住上下文）
npx tsx src/03-memory/chat.ts

# 第四章：长期记忆（交互式，跨 session 持久化）
npx tsx src/04-long-term/chat.ts

# 第七章：可复用技能（交互式，自动发现和加载技能）
npx tsx src/07-skill/chat.ts
```

### 测试

```bash
npm test                      # 全部测试
npx vitest run tests/02-agent-integration.test.ts  # 工具集成测试
npx vitest run tests/03-memory.test.ts              # 记忆系统测试
npx vitest run tests/04-long-term.test.ts           # 长期记忆测试
```

## 📚 技术栈

- **模型通信**: [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` + `@ai-sdk/openai`)
- **类型校验**: Zod
- **语言**: TypeScript
- **测试**: Vitest
