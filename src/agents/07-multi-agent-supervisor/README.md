# 07 - Multi-Agent Supervisor 模式

## 目标

实现 Supervisor 模式：一个调度者（Supervisor）管理多个专业 Agent。

## 核心概念

- **Supervisor**: 调度者，负责决策和分发任务
- **Specialized Agent**: 专业 Agent，各司其职
- **Task Routing**: 任务路由

## 架构

```
用户请求
    ↓
Supervisor（调度者）
    ↓
根据意图分发
    ↓
┌─────────┴─────────┐
↓                   ↓
Research Agent   Code Agent
（研究）          （编码）
    ↓                   ↓
    └─────────┬─────────┘
              ↓
         汇总回答
```

## 待实现

- Supervisor Agent
- 专业化 Agent（研究、编码、搜索等）
- 任务分发逻辑
- 结果汇总

## 运行

```bash
npx tsx src/agents/07-multi-agent-supervisor/index.ts
```
