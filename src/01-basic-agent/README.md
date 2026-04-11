# 01 - 基础 Agent

## 目标

实现单轮对话和持续对话两种模式。

## 核心概念

- **`generateText()`**: Vercel AI SDK 最基础的调用方式
- **单轮**: 直接传 `prompt`，发一条收一条
- **多轮**: 传 `messages` 数组，自动累积上下文
- **`ChatAgent` 类**: 封装 messages 维护逻辑，调用方只需 `say()`

## 底层原理

### 单轮

```
generateText({ model, system, prompt })
    ↓
构造 messages = [{ role: "user", content: prompt }]
    ↓
HTTP 请求 → LLM API
    ↓
返回 { text, usage, ... }
```

### 多轮

```
messages = []
用户说 "你好"  → messages.push(user)
               → generateText({ model, system, messages })
               → messages.push(assistant)

用户说 "继续"  → messages.push(user)  // 包含上一轮历史
               → generateText({ model, system, messages })
               → messages.push(assistant)
```

上下文累积就靠 messages 数组不断追加。

## 代码结构

```
01-basic-agent/
├── agent.ts    # chat() 单轮函数 + ChatAgent 多轮类
├── index.ts    # 单轮演示（跑预设问题）
├── chat.ts     # 持续对话（交互式循环）
└── README.md
```

## 运行

```bash
# 单轮对话
npx tsx src/01-basic-agent/index.ts

# 持续对话
npx tsx src/01-basic-agent/chat.ts
```

持续对话交互命令：
- `/exit` — 退出
- `/clear` — 清除上下文（重新开始对话）
