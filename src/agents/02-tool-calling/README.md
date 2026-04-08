# 02 - 工具调用

## 目标

给 Agent 添加工具调用能力，实现 ReAct（Reasoning + Acting）模式。

## 核心概念

- **Tool**: 工具，Agent 与外部世界交互的桥梁
- **ReAct**: Reasoning + Acting，让 Agent 思考→行动→观察循环
- **createTool**: Mastra 提供的工具创建函数

## 代码结构

```
02-tool-calling/
├── index.ts        # 入口
├── agent.ts        # 带工具的 Agent
├── tools/
│   └── time-tool.ts   # 时间工具示例
└── README.md
```

## 运行

```bash
npx tsx src/agents/02-tool-calling/index.ts
```

## 流程

```
用户提问 → Agent 思考 → 判断是否需要工具
    ↓                          ↓
  不需要                    需要工具
    ↓                          ↓
  直接回答              执行工具 → 观察结果 → 继续思考 → 回答
```
