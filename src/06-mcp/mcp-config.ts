/**
 * MCP 配置管理
 *
 * 核心思想：MCP Servers 通过配置文件声明，Agent 运行时动态加载。
 *
 * 配置格式参考 Claude Desktop 的 mcpServers：
 * {
 *   "mcpServers": {
 *     "local-tools": {
 *       "command": "npx",
 *       "args": ["tsx", "server.ts"]
 *     },
 *     "remote-api": {
 *       "url": "https://example.com/mcp"
 *     }
 *   }
 * }
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ══════════════════════════════════════════
// 类型定义
// ══════════════════════════════════════════

/** stdio transport 配置 */
export interface StdioServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** HTTP/SSE transport 配置 */
export interface HttpServerConfig {
  url: string;
  headers?: Record<string, string>;
}

/** 单个 MCP Server 配置 */
export type ServerConfig = StdioServerConfig | HttpServerConfig;

/** 配置文件根结构 */
export interface McpConfig {
  mcpServers: Record<string, ServerConfig>;
}

// ══════════════════════════════════════════
// 配置加载
// ══════════════════════════════════════════

/**
 * 从 JSON 文件加载 MCP 配置
 *
 * @param configPath - 配置文件路径
 * @returns 解析后的配置对象
 */
export function loadConfig(configPath: string): McpConfig {
  const absPath = path.resolve(configPath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`MCP 配置文件不存在: ${absPath}`);
  }

  const content = fs.readFileSync(absPath, "utf-8");
  const config = JSON.parse(content) as McpConfig;

  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    throw new Error("配置文件格式错误：缺少 mcpServers 字段");
  }

  return config;
}

/** 判断是否为 stdio 配置 */
export function isStdioConfig(config: ServerConfig): config is StdioServerConfig {
  return "command" in config;
}

/** 判断是否为 HTTP 配置 */
export function isHttpConfig(config: ServerConfig): config is HttpServerConfig {
  return "url" in config;
}
