# 01 - 基础 Agent

## 目标

创建一个最简单的 Agent，实现单轮对话。

## 核心概念

- **Agent**: 智能体，LLM + 指令模板
- **LLM**: 大语言模型，本项目使用 OpenRouter
- **Instructions**: 给 Agent 的系统指令

## 代码结构

```
01-basic-agent/
├── index.ts        # 入口
├── agent.ts        # Agent 定义
└── README.md
```

## 运行

```bash
npx tsx src/agents/01-basic-agent/index.ts
```
