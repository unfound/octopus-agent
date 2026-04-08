# 04 - 短期记忆

## 目标

实现对话历史的短期记忆管理，让 Agent 能记住当前对话的上下文。

## 核心概念

- **Conversation History**: 对话历史
- **Context Window**: 上下文窗口管理
- **Message Truncation**: 消息截断策略

## 待实现

- 将用户和助手的对话保存到内存中
- 实现上下文窗口管理
- 支持多轮对话

## 运行

```bash
npx tsx src/memory/04-short-term-memory/index.ts
```
