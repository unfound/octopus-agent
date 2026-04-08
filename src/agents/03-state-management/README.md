# 03 - 状态管理

## 目标

理解 Mastra 中的状态管理机制，包括 Memory 和 Session State。

## 核心概念

- **Memory**: Agent 的记忆能力
- **Session State**: 会话级别的状态管理

## 待实现

```typescript
// 状态管理示例
const agent = new Agent({
  name: "Stateful Agent",
  instructions,
  model,
  memory: new Memory({
    // 短期记忆配置
  }),
});
```

## 运行

```bash
npx tsx src/agents/03-state-management/index.ts
```
