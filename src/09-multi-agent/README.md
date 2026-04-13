# 09 - Multi-Agent（主 Agent 对等协作）

## 为什么要用 Multi-Agent？

Sub-Agent 解决的是「一个 Agent 干不完」的问题，Multi-Agent 解决的是「多个专业 Agent 怎么长期配合」的问题：

1. **专业分工** — 不同 Agent 有不同专长（研究员、作家、审稿人），各自维护自己的知识和工具，不需要一个 Agent 啥都会
2. **持续协作** — 不是一次性委派，而是 Agent 之间持续对话、互相请求、交换信息
3. **去中心化** — 没有固定的"上级"，Agent 自己判断该自己做还是转给别人

类比：Sub-Agent 像经理临时招外包干活，Multi-Agent 像一个团队里的同事长期协作。

## 应用场景

- **专家协作** — 研究 Agent 收集信息，写作 Agent 撰写报告，审核 Agent 质量把关
- **客服路由** — 一个 Agent 接收用户请求，根据意图转交给技术支持/账单查询/售前咨询等专业 Agent
- **辩论决策** — 多个 Agent 对方案发表不同观点，综合最优解
- **持续助手** — 日历 Agent、邮件 Agent、代码 Agent 各自独立运行，但可以互相请求帮助

## 架构

```
┌─────────────┐                 ┌─────────────┐
│  Agent A     │◄──MessageBus──►│  Agent B     │
│  (Researcher)│                 │   (Writer)   │
│  独立能力     │                 │  独立能力     │
│  独立记忆     │                 │  独立记忆     │
└─────────────┘                 └─────────────┘
```

## 通信模式

### 1. Message Bus（消息总线）
- Agent 之间通过 MessageBus 异步通信
- 每个 Agent 注册到 Bus，声明自己能处理的 action
- 消息结构：`{ from, to, action, payload, replyTo? }`
- 支持 request/response 模式（同步 RPC）和 notify（单向通知）

### 2. Handoff（对等转交）
- Agent A 觉得 Agent B 更合适处理当前任务 → 转交
- 没有"上级"，Agent 自己决定转给谁
- 转交时携带上下文（用户意图 + 已有信息）
- 类似 OpenAI Swarm 的思路

## 文件结构

```
09-multi-agent/
├── README.md        ← 本文件
├── message-bus.ts   # 消息总线：register / send / request
├── agent.ts         # PeerAgent 基类（name, bus, handleMessage）
├── handoff.ts       # handoff() 工具生成器 — agent 间转交
├── chat.ts          # 交互入口：创建多个 peer agent，启动协作
```

## 设计要点

### MessageBus
```typescript
interface AgentMessage {
  id: string;           // 消息唯一ID
  from: string;         // 发送者 agent 名称
  to: string;           // 接收者 agent 名称
  action: string;       // 动作/意图（如 "research", "write_report"）
  payload: unknown;     // 消息数据
  replyTo?: string;     // 关联的请求消息ID（用于 response 配对）
}

class MessageBus {
  register(name: string, handler: (msg: AgentMessage) => Promise<AgentMessage | void>): void;
  send(msg: Omit<AgentMessage, "id">): void;                    // 单向发送
  request(msg: Omit<AgentMessage, "id">): Promise<AgentMessage>; // RPC：发消息等回复
}
```

### PeerAgent
```typescript
class PeerAgent {
  name: string;
  description: string;  // 这个 agent 能做什么（用于路由/发现）
  bus: MessageBus;
  model: LanguageModel;
  store: MessageStore;  // 独立的对话历史

  // 处理收到的消息（LLM 决策 + 执行）
  async handleMessage(msg: AgentMessage): Promise<AgentMessage | void>;

  // 主动向其他 agent 发消息
  async sendTo(target: string, action: string, payload: unknown): Promise<AgentMessage>;
}
```

### Handoff 工具
```typescript
// 给 agent 的工具列表里加一个 handoff tool
// agent 自己判断是否需要转交给其他 agent
function handoffTool(agents: PeerAgent[]) {
  return tool({
    description: "将任务转交给另一个更合适的 Agent",
    inputSchema: z.object({
      target: z.string().describe("目标 Agent 名称"),
      reason: z.string().describe("转交原因"),
      context: z.string().describe("要传递的上下文"),
    }),
    execute: async ({ target, reason, context }) => {
      // 把当前任务上下文转给目标 agent
      // 目标 agent 接手处理
    }
  });
}
```

## Demo 场景

**研究 + 写作协作：**
1. 用户问："帮我研究 TypeScript 类型系统，然后写一篇博客"
2. Researcher Agent 收到任务，通过 web 搜索收集信息
3. Researcher 通过 MessageBus 把研究结果发给 Writer Agent
4. Writer Agent 基于研究成果撰写博客
5. Writer 把成品返回给用户

## 与 08-sub-agent 的区别

| 维度 | 08-sub-agent | 09-multi-agent |
|------|-------------|---------------|
| 关系 | 主从 (parent-child) | 对等 (peer-to-peer) |
| 生命周期 | 临时，任务完成即销毁 | 长驻，持续监听消息 |
| 上下文 | child 从零开始（带 goal+context） | 各自独立 |
| 工具集 | child 受限（排除危险工具） | 各自完整 |
| 通信 | parent → child 单向委派 | MessageBus 双向 |
| 并发 | 天然支持并行 | 串行为主 |
