# 🐙 Octopus Agent

> 从零搭建 AI Agent — 基于 Vercel AI SDK 的 TypeScript 学习项目

## 📖 项目简介

不依赖高层框架（Mastra、LangChain），用 **Vercel AI SDK** 做底层通信，自己实现 Agent 的核心机制。

目标：**每一步都理解代码在做什么。**

## 🛤️ 开发路线图

### 阶段一：基础

| 章节 | 描述 | 状态 |
|------|------|------|
| [01-basic-agent](./src/01-basic-agent/) | 单轮对话 — `generateText()` 调用 LLM | ✅ |
| [02-tool-system](./src/02-tool-system/) | 工具调用 — `tool()` + 自定义 ReAct 循环 | ✅ |

### 阶段二：记忆（规划中）

| 章节 | 描述 | 状态 |
|------|------|------|
| 03-memory | 对话历史管理 + 上下文窗口 | ⬜ |
| 04-long-term | 长期记忆 — 向量存储 + 语义检索 | ⬜ |

### 阶段三：RAG + MCP（规划中）

| 章节 | 描述 | 状态 |
|------|------|------|
| 05-rag | 检索增强生成 — 文档切片 + embedding | ⬜ |
| 06-mcp | MCP 协议 — 标准化工具/资源接入 | ⬜ |

### 阶段四：多 Agent（规划中）

| 章节 | 描述 | 状态 |
|------|------|------|
| 07-multi-agent | Agent 间通信 — supervisor / handoff | ⬜ |

### 阶段五：生产增强（规划中）

| 章节 | 描述 | 状态 |
|------|------|------|
| 08-evaluation | 评估框架 — 自动评分 + 回归测试 | ⬜ |

## 🏗️ 目录结构

```
octopus-agent/
├── src/
│   ├── shared/              # 共享模块
│   │   └── model.ts         # 模型配置（OpenRouter / 本地模型）
│   ├── 01-basic-agent/      # 单轮对话
│   └── 02-tool-system/      # 工具调用 + ReAct 循环
├── tests/                   # 测试
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

### 运行示例

```bash
# 单轮对话
npx tsx src/01-basic-agent/index.ts

# 工具调用
npx tsx src/02-tool-system/index.ts
```

### 测试

```bash
npm test
```

## 📚 技术栈

- **模型通信**: [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` + `@ai-sdk/openai`)
- **类型校验**: Zod
- **语言**: TypeScript
- **测试**: Vitest
