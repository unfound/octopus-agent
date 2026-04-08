# 09 - Agent 交接

## 目标

实现 Agent 之间的任务交接，一个 Agent 可以将任务传递给另一个更适合的 Agent。

## 核心概念

- **Handoff**: 交接协议
- **Context Transfer**: 上下文传递
- **Escalation**: 升级机制

## 交接流程

```
Agent A 收到任务
    ↓
判断：A 是否能处理？
    ↓
是 → 处理 → 回答
    ↓
否 → 交接给 Agent B
    ↓
传递上下文（历史 + 当前状态）
    ↓
Agent B 继续处理
```

## 待实现

- Handoff 协议定义
- 上下文打包与传递
- 交接日志追踪

## 运行

```bash
npx tsx src/agents/09-agent-handoffs/index.ts
```
