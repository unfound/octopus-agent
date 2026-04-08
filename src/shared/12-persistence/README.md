# 12 - 持久化

## 目标

实现 Agent 状态的持久化，包括 Checkpoint 和 Session 持久化。

## 核心概念

- **Checkpoint**: 状态快照
- **Session Persistence**: 会话持久化
- **Resume**: 恢复机制
- **Serialization**: 序列化

## 待实现

- Checkpoint 管理
- Session 持久化到数据库
- 状态恢复
- 快照策略

## 运行

```bash
npx tsx src/shared/12-persistence/index.ts
```
