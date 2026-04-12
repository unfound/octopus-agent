/**
 * 06-mcp 测试
 *
 * 测试 MCP 协议通信：连接、发现工具、调用工具
 * 不需要 LLM，纯测 MCP Server ↔ Client
 *
 * 运行方式：npx vitest run tests/06-mcp.test.ts
 */

import { describe, it, expect, afterAll } from "vitest";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFromConfig } from "../src/06-mcp/mcp-loader.js";

const configPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/06-mcp/mcp-servers.json"
);

describe("MCP Server ↔ Client", () => {
  let tools: Record<string, ReturnType<typeof import("ai").tool>>;
  let close: () => Promise<void>;

  // 所有测试共享一个连接
  afterAll(async () => {
    if (close) await close();
  });

  it("should connect and discover tools", async () => {
    const result = await loadFromConfig(configPath);
    tools = result.tools;
    close = result.close;

    // 应该发现 4 个工具
    expect(Object.keys(tools)).toHaveLength(4);
    expect(tools).toHaveProperty("read_file");
    expect(tools).toHaveProperty("write_file");
    expect(tools).toHaveProperty("list_directory");
    expect(tools).toHaveProperty("exec_command");
  });

  it("should list directory", async () => {
    const result = await tools.list_directory.execute(
      { path: "." },
      { messages: [], toolCallId: "test-1" }
    );
    expect(result).toContain("package.json");
    expect(result).toContain("src");
  });

  it("should read file", async () => {
    const result = await tools.read_file.execute(
      { path: "package.json", offset: 1, limit: 3 },
      { messages: [], toolCallId: "test-2" }
    );
    expect(result).toContain("octopus-agent");
  });

  it("should execute command", async () => {
    const result = await tools.exec_command.execute(
      { command: "echo hello-mcp" },
      { messages: [], toolCallId: "test-3" }
    );
    expect(result).toContain("hello-mcp");
  });

  it("should write file", async () => {
    const result = await tools.write_file.execute(
      { path: "/tmp/mcp-test.txt", content: "test content" },
      { messages: [], toolCallId: "test-4" }
    );
    expect(result).toContain("写入成功");
  });
});
