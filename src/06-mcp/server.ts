/**
 * 本地 MCP Server — 暴露文件系统和命令执行工具
 *
 * 这是一个独立进程，通过 stdio transport 与 MCP Client 通信。
 * 客户端启动时会 spawn 这个进程，通过 stdin/stdout 交换 JSON-RPC 消息。
 *
 * 运行方式（测试用）：
 *   npx tsx src/06-mcp/server.ts
 *
 * 实际使用时由 MCP Client 自动启动，不需要手动运行。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execSync } from "node:child_process";

// ══════════════════════════════════════════
// 创建 MCP Server
// ══════════════════════════════════════════
const server = new McpServer({
  name: "octopus-local-tools",
  version: "1.0.0",
});

// ══════════════════════════════════════════
// 注册工具：read_file
// ══════════════════════════════════════════
server.tool(
  "read_file",
  "读取文件内容。支持指定行范围（offset + limit），适合大文件分段读取。",
  {
    path: z.string().describe("文件路径（绝对或相对路径）"),
    offset: z.number().optional().default(1).describe("起始行号（1-indexed，默认 1）"),
    limit: z.number().optional().default(500).describe("最大行数（默认 500）"),
  },
  async ({ path: filePath, offset, limit }) => {
    try {
      const absPath = path.resolve(filePath);
      const content = await fs.readFile(absPath, "utf-8");
      const lines = content.split("\n");

      const start = Math.max(0, offset - 1);
      const end = Math.min(lines.length, start + limit);
      const selected = lines.slice(start, end);

      const numbered = selected
        .map((line, i) => `${start + i + 1}|${line}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `文件: ${absPath} (共 ${lines.length} 行，显示 ${start + 1}-${end})\n\n${numbered}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `读取失败: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ══════════════════════════════════════════
// 注册工具：write_file
// ══════════════════════════════════════════
server.tool(
  "write_file",
  "写入文件内容。如果文件已存在会覆盖。自动创建父目录。",
  {
    path: z.string().describe("文件路径"),
    content: z.string().describe("要写入的内容"),
  },
  async ({ path: filePath, content }) => {
    try {
      const absPath = path.resolve(filePath);
      // 确保父目录存在
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, content, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: `写入成功: ${absPath} (${content.length} 字符)`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `写入失败: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ══════════════════════════════════════════
// 注册工具：list_directory
// ══════════════════════════════════════════
server.tool(
  "list_directory",
  "列出目录内容。返回文件和子目录列表，标记类型（文件 📄 / 目录 📁）。",
  {
    path: z.string().optional().default(".").describe("目录路径（默认当前目录）"),
  },
  async ({ path: dirPath }) => {
    try {
      const absPath = path.resolve(dirPath);
      const entries = await fs.readdir(absPath, { withFileTypes: true });

      const items = entries
        .sort((a, b) => {
          // 目录排前面
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        })
        .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`);

      return {
        content: [
          {
            type: "text",
            text: `目录: ${absPath} (${entries.length} 项)\n\n${items.join("\n")}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `列出目录失败: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ══════════════════════════════════════════
// 注册工具：exec_command
// ══════════════════════════════════════════
server.tool(
  "exec_command",
  "执行 shell 命令。返回 stdout 和 stderr。超时 30 秒。",
  {
    command: z.string().describe("要执行的 shell 命令"),
  },
  async ({ command }) => {
    try {
      const output = execSync(command, {
        encoding: "utf-8",
        timeout: 30_000,
        maxBuffer: 1024 * 1024, // 1MB
      });

      return {
        content: [
          {
            type: "text",
            text: output || "(命令执行成功，无输出)",
          },
        ],
      };
    } catch (err) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      return {
        content: [
          {
            type: "text",
            text: [error.stdout, error.stderr, error.message].filter(Boolean).join("\n") || "命令执行失败",
          },
        ],
        isError: true,
      };
    }
  }
);

// ══════════════════════════════════════════
// 启动 Server
// ══════════════════════════════════════════
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server 已启动，通过 stdio 等待客户端消息
  // 不要 console.log — 会污染 stdio 通道！
}

main().catch((err) => {
  // 启动失败可以输出到 stderr
  console.error("MCP Server 启动失败:", err);
  process.exit(1);
});
