/**
 * MCP Client 封装
 *
 * 职责单一：管理一个 MCP Server 连接
 * - 连接 / 断开
 * - 发现工具
 * - 调用工具
 * - 转换为 AI SDK 格式
 *
 * 不关心配置来源 — 配置由 mcp-config.ts / mcp-loader.ts 处理
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { tool } from "ai";
import { z } from "zod";
import { isStdioConfig, isHttpConfig, type ServerConfig } from "./mcp-config.js";

// ══════════════════════════════════════════
// 类型
// ══════════════════════════════════════════

/** 连接结果 */
export interface McpConnection {
  name: string;
  client: Client;
  tools: Awaited<ReturnType<Client["listTools"]>>["tools"];
  close: () => Promise<void>;
}

// ══════════════════════════════════════════
// 连接单个 MCP Server
// ══════════════════════════════════════════

/**
 * 连接到一个 MCP Server
 *
 * @param name - Server 名称（用于日志）
 * @param config - Server 配置（stdio 或 http）
 * @returns 连接对象
 */
export async function connectToServer(name: string, config: ServerConfig): Promise<McpConnection> {
  const client = new Client({
    name: "octopus-agent",
    version: "1.0.0",
  });

  // 根据配置类型创建 transport
  let transport;

  if (isStdioConfig(config)) {
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env,
    });
  } else if (isHttpConfig(config)) {
    const url = new URL(config.url);
    transport = new StreamableHTTPClientTransport(url, {
      requestInit: config.headers ? { headers: config.headers } : undefined,
    });
  } else {
    throw new Error(`未知的 transport 类型: ${JSON.stringify(config)}`);
  }

  await client.connect(transport);
  console.log(`  ✅ 已连接 MCP Server: ${name}`);

  const { tools: serverTools } = await client.listTools();
  console.log(`  📋 ${name}: ${serverTools.map((t) => t.name).join(", ")}`);

  return {
    name,
    client,
    tools: serverTools,
    close: async () => {
      await client.close();
      console.log(`  🔌 已断开: ${name}`);
    },
  };
}

// ══════════════════════════════════════════
// MCP Tools → AI SDK Tools 转换
// ══════════════════════════════════════════

/**
 * 把 MCP 工具列表转成 AI SDK tools
 */
export function convertToAiTools(
  client: Client,
  serverTools: McpConnection["tools"]
): Record<string, ReturnType<typeof tool>> {
  const aiTools: Record<string, ReturnType<typeof tool>> = {};

  for (const t of serverTools) {
    const zodSchema = jsonSchemaToZod(t.inputSchema as Record<string, unknown>);

    aiTools[t.name] = tool({
      description: t.description ?? "",
      parameters: zodSchema,
      execute: async (args) => {
        const result = await client.callTool({
          name: t.name,
          arguments: args as Record<string, unknown>,
        });
        return result.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
      },
    });
  }

  return aiTools;
}

// ══════════════════════════════════════════
// JSON Schema → Zod 转换
// ══════════════════════════════════════════

function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  if (schema.type !== "object" || !schema.properties) {
    return z.object({}).passthrough();
  }

  const shape: Record<string, z.ZodType> = {};
  const required = (schema.required as string[]) || [];

  for (const [key, prop] of Object.entries(schema.properties as Record<string, Record<string, unknown>>)) {
    let zodType: z.ZodType;

    switch (prop.type) {
      case "string": zodType = z.string(); break;
      case "number": zodType = z.number(); break;
      case "boolean": zodType = z.boolean(); break;
      case "integer": zodType = z.number().int(); break;
      default: zodType = z.any();
    }

    if (prop.description) zodType = zodType.describe(prop.description as string);
    if (!required.includes(key)) {
      zodType = zodType.optional();
      if (prop.default !== undefined) zodType = zodType.default(prop.default);
    }

    shape[key] = zodType;
  }

  return z.object(shape);
}
