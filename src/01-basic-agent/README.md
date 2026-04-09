# 01 - 基础 Agent

## 目标

创建一个最简单的 Agent，实现单轮对话。

## 核心概念

- **`generateText()`**: Vercel AI SDK 最基础的调用方式
- **消息格式**: `system`（系统指令）+ `prompt`（用户输入）
- **模型配置**: 通过 `@ai-sdk/openai` 适配不同 provider

## 底层原理

```
generateText({ model, system, prompt })
    ↓
构造 messages 数组
    ↓
HTTP 请求 → LLM API
    ↓
返回 { text, usage, ... }
```

就这么简单。没有魔法，没有隐藏层。

## 代码结构

```
01-basic-agent/
├── agent.ts        # chat() 函数
├── index.ts        # 演示入口
└── README.md
```

## 运行

```bash
npx tsx src/01-basic-agent/index.ts
```
