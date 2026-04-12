# 06 - MCP (Model Context Protocol)

工具不再写死在代码里，而是由外部 **MCP Server** 动态提供。

## 核心架构

```
mcp-servers.json          mcp-loader.ts              agent.ts
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│ "servers": { │     │ 读取配置          │     │              │
│   "fs": ...  │────→│ 连接所有 servers  │────→│  ReAct 循环   │
│   "db": ...  │     │ 合并 tools       │     │  (不关心来源)  │
│ }            │     └──────────────────┘     └──────────────┘
└──────────────┘
```

**解耦要点：**
- Agent 只接收 `tools` 对象，不关心来自哪个 Server
- 配置独立声明，新增/删除 Server 只改配置文件
- 多个 Server 的 tools 自动合并，命名冲突自动跳过

## 文件结构

```
src/06-mcp/
├── server.ts          # MCP Server — 暴露文件系统工具
├── mcp-config.ts      # 配置类型 + 加载
├── mcp-client.ts      # MCP Client — 单个 Server 连接管理
├── mcp-loader.ts      # Loader — 读配置 → 连接多个 servers → 合并 tools
├── agent.ts           # Agent — 只接收 tools，与 MCP 解耦
├── chat.ts            # 交互入口
├── mcp-servers.json   # 配置示例
└── README.md
```

## 配置文件

`mcp-servers.json` — 参考 Claude Desktop 格式：

```json
{
  "mcpServers": {
    "local-tools": {
      "command": "npx",
      "args": ["tsx", "src/06-mcp/server.ts"]
    },
    "another-server": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": { "API_KEY": "xxx" }
    }
  }
}
```

支持的 transport：
- **stdio** — 本地进程（`command` + `args`）
- **HTTP** — 远程服务（`url`）

## 运行

```bash
# 交互式对话（从配置文件加载 MCP Servers）
npx tsx src/06-mcp/chat.ts

# 指定配置文件
npx tsx src/06-mcp/chat.ts /path/to/mcp-servers.json

# 测试（不需要 LLM）
npx vitest run tests/06-mcp.test.ts
```

### 测试用例

1. `列出当前目录的内容` → 调用 `list_directory`
2. `读取 package.json` → 调用 `read_file`
3. `创建一个 test.txt 写入 hello` → 调用 `write_file`
4. `运行 pwd 看看当前路径` → 调用 `exec_command`

## 与 02-tool-system 的对比

| | 02-tool-system | 06-mcp |
|---|---|---|
| 工具定义 | 本地 `tool()` 函数 | MCP Server 暴露 |
| 工具发现 | 写死在代码里 | `listTools()` 动态发现 |
| 工具执行 | 直接调用函数 | JSON-RPC 调用 Server |
| 扩展方式 | 改代码 | 加配置 + 启动新 Server |
| 进程模型 | 同一进程 | Server 是独立进程 |

## 关键代码

### Agent（完全解耦）

```ts
// Agent 不关心 tools 从哪来
async function agentChat(
  userMessage: string,
  tools: Record<string, Tool>  // 来源无关！
) { ... }
```

### Loader（配置驱动）

```ts
// 从配置文件加载所有 servers
const { tools, close } = await loadFromConfig("mcp-servers.json");

// 传给 Agent
await agentChat("帮我看看目录", tools);
```

## 延伸阅读

- [MCP 官方文档](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Desktop MCP 配置](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
