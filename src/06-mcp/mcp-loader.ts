/**
 * MCP Loader — 从配置文件加载多个 MCP Servers
 *
 * 职责：
 *   1. 读取配置文件
 *   2. 连接所有声明的 MCP Servers
 *   3. 合并所有 tools（处理命名冲突）
 *   4. 返回统一的 tools 对象 + 清理函数
 *
 * Agent 不需要知道有几个 Server、怎么连接 — 它只拿到 tools。
 */

import { loadConfig, type McpConfig, type ServerConfig } from "./mcp-config.js";
import { connectToServer, convertToAiTools, type McpConnection } from "./mcp-client.js";

// ══════════════════════════════════════════
// 类型
// ══════════════════════════════════════════

export interface LoadedMcpServers {
  /** 合并后的 AI SDK tools */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: Record<string, any>;
  /** 所有连接（用于调试） */
  connections: McpConnection[];
  /** 关闭所有连接 */
  close: () => Promise<void>;
}

// ══════════════════════════════════════════
// 加载入口
// ══════════════════════════════════════════

/**
 * 从配置文件加载所有 MCP Servers
 *
 * @param configPath - 配置文件路径（JSON）
 * @returns 合并后的 tools + 连接管理
 */
export async function loadFromConfig(configPath: string): Promise<LoadedMcpServers> {
  const config = loadConfig(configPath);
  return loadFromObject(config);
}

/**
 * 从配置对象加载（支持直接传配置，不一定要读文件）
 */
export async function loadFromObject(config: McpConfig): Promise<LoadedMcpServers> {
  const connections: McpConnection[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTools: Record<string, any> = {};

  console.log(`\n🔌 加载 MCP Servers (共 ${Object.keys(config.mcpServers).length} 个)...\n`);

  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    try {
      const conn = await connectToServer(name, serverConfig as ServerConfig);
      connections.push(conn);

      const aiTools = convertToAiTools(conn.client, conn.tools);

      // 检查命名冲突
      for (const toolName of Object.keys(aiTools)) {
        if (allTools[toolName]) {
          console.warn(`  ⚠️  工具名冲突: ${toolName} (来自 ${name}，已被其他 server 注册，跳过)`);
        } else {
          allTools[toolName] = aiTools[toolName];
        }
      }
    } catch (err) {
      console.error(`  ❌ 连接 ${name} 失败: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n✅ 已加载 ${Object.keys(allTools).length} 个工具\n`);

  return {
    tools: allTools,
    connections,
    close: async () => {
      await Promise.all(connections.map((c) => c.close()));
    },
  };
}
