# 02 - 工具调用

## 目标

给 Agent 添加工具调用能力，实现 ReAct（Reasoning + Acting）模式。

## 核心概念

- **Tool**: 工具，Agent 与外部世界交互的桥梁
- **ReAct**: Reasoning + Acting，让 Agent 思考→行动→观察循环
- **createTool**: Mastra 提供的工具创建函数
- **Zod Schema**: 定义工具的输入输出类型，提供运行时校验

## 代码结构

```
02-tool-calling/
├── index.ts                  # 入口
├── agent.ts                  # 带工具的 Agent
├── tools/
│   ├── read-file-tool.ts     # 读取文件内容
│   ├── write-file-tool.ts    # 写入文件（自动建目录）
│   └── exec-command-tool.ts  # 执行 shell 命令
└── README.md
```

## 工具说明

### readFile

读取指定路径的文件内容。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | ✅ | 文件路径 |
| encoding | utf-8 / latin1 / base64 | ❌ | 编码，默认 utf-8 |
| maxLines | number | ❌ | 最大读取行数 |

### writeFile

写入内容到文件，自动创建不存在的目录。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | ✅ | 文件路径 |
| content | string | ✅ | 要写入的内容 |
| encoding | utf-8 / latin1 / base64 | ❌ | 编码，默认 utf-8 |
| append | boolean | ❌ | 追加模式，默认 false |

### execCommand

执行 shell 命令，返回 stdout、stderr 和退出码。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| command | string | ✅ | shell 命令 |
| cwd | string | ❌ | 工作目录 |
| timeout | number | ❌ | 超时（ms），默认 30000 |
| maxOutputLength | number | ❌ | 最大输出长度，默认 10000 |

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

## 实现要点

1. **零额外依赖**：三个工具全部使用 Node.js 内置模块（`fs/promises`、`child_process`）
2. **类型安全**：Zod schema 定义输入输出，编译时 + 运行时双保险
3. **生产友好**：writeFile 自动建目录、execCommand 支持超时和输出截断
