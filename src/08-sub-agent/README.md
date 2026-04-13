# 08 - Sub-Agent（子 Agent 委派系统）

## 为什么要用 Sub-Agent？

单 Agent 有三个瓶颈：

1. **上下文污染** — 一个 Agent 做研究、写代码、查文档，所有中间步骤都堆在同一上下文里，越来越臃肿，关键信息被淹没
2. **无法并行** — Agent 是串行执行的，研究三个框架只能一个一个来
3. **工具泛滥** — Agent 可以调所有工具，研究任务不需要写文件，写作任务不需要跑终端，工具越多 LLM 越容易选错

Sub-Agent 的核心思路：**让主 Agent 只做决策和协调，具体工作交给临时创建的子 Agent**。子 Agent 有独立上下文、受限工具集，任务完成后销毁，只把结果摘要返回给主 Agent。

## 应用场景

- **并行研究** — 同时调研多个主题（对比框架、搜索竞品），汇总结果
- **Pipeline 处理** — 研究 → 分析 → 写作，每个阶段由专注的子 Agent 完成
- **上下文隔离** — 长任务拆成子任务，避免主 Agent 上下文膨胀
- **多模型推理** — 同一问题用多个模型生成答案，聚合最优解（MoA）

## 架构

```
Parent Agent
  ├── spawn child 1 (isolated context, restricted tools)
  ├── spawn child 2 (parallel)
  └── spawn child 3 (parallel)
       ↓
  每个 child 独立运行
  只返回 summary 给 parent（中间步骤不泄露）
```

## 参考实现

### Hermes delegate_tool.py
- child 有独立 conversation，不继承 parent 历史
- 受限工具集：不能调 delegate_task、clarify、memory、send_message
- 最大深度 2（parent→child，child 不能再 spawn）
- 并行执行：ThreadPoolExecutor，最多 3 个并发
- 进度回调：child 的 tool call relay 给 parent 显示

### Hermes mixture_of_agents_tool.py
- 多个模型并行生成不同答案（Layer 1: reference models）
- 聚合器模型合成最终答案（Layer 2: aggregator）
- 异步执行 + 重试机制

## 文件结构

```
08-sub-agent/
├── README.md        ← 本文件
├── agent.ts         # SubAgent class（继承 Agent，加隔离上下文+受限工具）
├── delegate.ts      # delegate() 工具 — parent 创建并运行 child
├── moa.ts           # Mixture-of-Agents — 多模型并行+聚合
├── chat.ts          # 交互入口
```

## 设计要点

### SubAgent（子代理）
```typescript
class SubAgent {
  // 继承 Agent 的核心能力，但有以下区别：
  // 1. 独立的 MessageStore（不继承 parent 历史）
  // 2. 可配置的工具集（从 parent 工具集里排除危险工具）
  // 3. 临时生命周期（任务完成即销毁）
  // 4. 有 parent 引用（用于结果回传和进度回调）

  private parent?: Agent;
  private blockedTools: Set<string>;  // 禁止使用的工具

  async run(goal: string, context?: string): Promise<SubAgentResult>;
}
```

### delegate 工具
```typescript
// parent agent 的工具之一
function delegateTool(parent: Agent) {
  return tool({
    description: "将子任务委派给一个独立的子 Agent 执行",
    inputSchema: z.object({
      goal: z.string().describe("要委派的任务目标"),
      context: z.string().optional().describe("任务上下文"),
      toolsets: z.array(z.string()).optional().describe("允许使用的工具集"),
      model: z.string().optional().describe("使用的模型（默认继承 parent）"),
    }),
    execute: async ({ goal, context, toolsets, model }) => {
      // 1. 创建 SubAgent（受限工具集 + 隔离上下文）
      // 2. 运行 SubAgent
      // 3. 返回 summary 给 parent
      // 4. SubAgent 销毁
    }
  });
}
```

### 安全限制
```typescript
// 子代理禁止使用的工具
const BLOCKED_TOOLS = new Set([
  "delegate",    // 禁止递归委派（防无限嵌套）
  "clarify",     // 不能直接问用户
  "memory",      // 不能写 parent 的记忆
  "sendMessage", // 不能跨平台发消息
]);

// 最大委派深度
const MAX_DEPTH = 2;  // parent(0) → child(1) → 拒绝(2)

// 最大并发子代理数
const MAX_CONCURRENT = 3;
```

### Mixture-of-Agents（多模型协作）
```typescript
// 不是 agent 间协作，而是多模型并行推理 + 聚合
async function mixtureOfAgents(
  prompt: string,
  options?: {
    referenceModels?: string[];  // 参考模型列表
    aggregatorModel?: string;    // 聚合模型
    temperature?: number;        // 参考模型温度
  }
): Promise<string> {
  // Layer 1: 多个模型并行生成回答
  const responses = await Promise.all(
    models.map(m => generateText({ model: m, prompt, temperature: 0.6 }))
  );

  // Layer 2: 聚合模型综合所有回答
  const final = await generateText({
    model: aggregatorModel,
    messages: [
      { role: "system", content: AGGREGATOR_PROMPT },
      { role: "user", content: `参考回答:\n${responses.map((r,i) => `${i+1}. ${r}`).join('\n\n')}\n\n原始问题: ${prompt}` }
    ],
    temperature: 0.4,
  });

  return final.text;
}
```

## Demo 场景

### 场景 1：并行研究
```
用户："对比 React、Vue、Svelte 的优缺点"
  → parent 创建 3 个 child，分别研究一个框架
  → 3 个 child 并行执行
  → parent 收集 3 个 summary，整合输出对比表
```

### 场景 2：Pipeline 委派
```
用户："写一篇关于 Rust 所有权系统的文章"
  → parent 委派 child1 做研究
  → parent 拿到研究结果后，委派 child2 写文章
  → 串联委派，每个 child 专注一个阶段
```

### 场景 3：MoA 多模型推理
```
用户："证明 √2 是无理数"
  → 同时用 3 个模型生成证明过程
  → 聚合器综合最优证明
  → 输出最终答案
```

## 与 09-multi-agent 的区别

| 维度 | 08-sub-agent | 09-multi-agent |
|------|-------------|---------------|
| 关系 | 主从 (parent-child) | 对等 (peer-to-peer) |
| 生命周期 | 临时，任务完成即销毁 | 长驻，持续监听消息 |
| 上下文 | child 从零开始（带 goal+context） | 各自独立 |
| 工具集 | child 受限（排除危险工具） | 各自完整 |
| 通信 | parent → child 单向委派 | MessageBus 双向 |
| 并发 | 天然支持并行 | 串行为主 |
