# 08 - Multi-Agent 网络模式

## 目标

实现多个对等 Agent 之间的协作网络，Agent 可以相互通信和协作。

## 核心概念

- **Network**: Agent 网络拓扑
- **Peer-to-Peer**: 对等通信
- **Agent Registry**: Agent 注册表
- **Message Passing**: 消息传递

## 架构

```
    ┌───────┐
    │Agent A│
    └───┬───┘
        │ ↔ 消息传递
    ┌───┴───┐
    ↓       ↓
┌───────┐ ┌───────┐
│Agent B│ │Agent C│
└───┬───┘ └───┬───┘
    └───────┬─┘
            ↓
       共享上下文
```

## 待实现

- Agent 注册发现机制
- Agent 间消息传递
- 协作工作流

## 运行

```bash
npx tsx src/agents/08-multi-agent-network/index.ts
```
