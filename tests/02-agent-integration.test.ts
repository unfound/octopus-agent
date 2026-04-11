/**
 * 02-tool-system Agent 集成测试
 *
 * 测试 agentChat 在多轮场景下的工具调用能力
 * 运行方式：npx vitest run tests/02-agent-integration.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { agentChat } from "../src/02-tool-system/agent";

const TEST_DIR = "/tmp/agent-test";

describe("agentChat tool integration", () => {
  beforeAll(async () => {
    // 清理测试目录
    const { execCommandTool } = await import("../src/02-tool-system/tools");
    await execCommandTool.execute(
      { command: `rm -rf ${TEST_DIR}` },
      {} as never,
    );
  });

  it("should write a file", async () => {
    const result = await agentChat(
      `在 ${TEST_DIR}/hello.txt 写入 'Hello from Agent!'`,
    );
    expect(result).toBeTruthy();
  }, 30000);

  it("should read a file", async () => {
    const result = await agentChat(`读取 ${TEST_DIR}/hello.txt`);
    expect(result).toContain("Hello from Agent!");
  }, 30000);

  it("should execute a command", async () => {
    const result = await agentChat(`运行 \`ls -la ${TEST_DIR}/\` 看看目录`);
    expect(result).toContain("hello.txt");
  }, 30000);
});
