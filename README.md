# 🐙 Octopus Agent

> 基于 Mastra 的 TypeScript AI Agent 学习项目

## 📖 项目简介

一个从零开始搭建的 AI Agent 系统，使用 [Mastra](https://mastra.ai/) 框架。目标：

- **代码简洁**：易于阅读和理解，不追求花哨
- **模块化**：各功能独立，可插拔
- **渐进式**：从简单功能到完整系统

## 🛤️ 开发路线图

### 阶段一：单 Agent 基础

| 项目 | 描述 | 核心概念 |
|------|------|---------|
| [01-basic-agent](./src/agents/01-basic-agent/) | 单轮对话 Agent | Agent、LLM 调用、指令模板 |
| [02-tool-calling](./src/agents/02-tool-calling/) | 工具调用 | createTool、ReAct 模式 |
| [03-state-management](./src/agents/03-state-management/) | 状态管理 | Memory、Session State |

### 阶段二：记忆系统

| 项目 | 描述 | 核心概念 |
|------|------|---------|
| [04-short-term-memory](./src/memory/04-short-term-memory/) | 短期记忆 | 对话历史管理 |
| [05-long-term-memory](./src/memory/05-long-term-memory/) | 长期记忆 | 向量存储、RAG |
| [06-memory-router](./src/memory/06-memory-router/) | 记忆路由 | 根据问题类型选择策略 |

### 阶段三：多 Agent 协作

| 项目 | 描述 | 核心概念 |
|------|------|---------|
| [07-multi-agent-supervisor](./src/agents/07-multi-agent-supervisor/) | Supervisor 模式 | 一个调度者管理多个 Agent |
| [08-multi-agent-network](./src/agents/08-multi-agent-network/) | 网络模式 | 多个对等 Agent 协作 |
| [09-agent-handoffs](./src/agents/09-agent-handoffs/) | Agent 交接 | 任务在不同 Agent 间传递 |

### 阶段四：生产增强

| 项目 | 描述 | 核心概念 |
|------|------|---------|
| [10-error-handling](./src/shared/10-error-handling/) | 错误处理 | 重试、降级、熔断 |
| [11-observability](./src/shared/11-observability/) | 可观测性 | Tracing、日志、监控 |
| [12-persistence](./src/shared/12-persistence/) | 持久化 | Checkpoint、Session 持久化 |

## 🏗️ 目录结构

```
octopus-agent-mastra/
├── src/
│   ├── agents/              # Agent 相关
│   │   ├── 01-basic-agent/
│   │   ├── 02-tool-calling/
│   │   └── 07-multi-agent-supervisor/
│   ├── tools/               # 工具集
│   ├── memory/              # 记忆系统
│   ├── workflows/           # 工作流
│   └── shared/             # 共享模块
├── tests/                  # 测试
└── README.md
```

## 🚀 快速开始

### 环境要求

- Node.js 20+
- npm / pnpm / yarn / bun

### 安装依赖

```bash
cd octopus-agent-mastra
npm install @mastra/core @mastra/runtime-openai zod
```

### 运行示例

```bash
# 进入某个阶段
cd src/agents/01-basic-agent

# 运行
npx tsx index.ts
```

## 📚 技术栈

- **框架**: Mastra v1+
- **语言**: TypeScript
- **运行时**: Node.js 20+
- **模型**: OpenRouter (支持免费模型)

## 📝 笔记

每个阶段都有自己的 README.md 详细说明实现细节和原理。

## 🤝 贡献

这是一个学习项目，欢迎提出建议和改进！
