/**
 * 02-tool-calling 工具测试
 *
 * 测试 readFile / writeFile / execCommand 三个工具的基本功能
 *
 * 运行方式：
 * npx vitest run tests/tool-calling.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileTool } from "../src/agents/02-tool-calling/tools/read-file-tool";
import { writeFileTool } from "../src/agents/02-tool-calling/tools/write-file-tool";
import { execCommandTool } from "../src/agents/02-tool-calling/tools/exec-command-tool";

const TEST_DIR = "/tmp/mastra-tool-test";
const TEST_FILE = `${TEST_DIR}/hello.txt`;

describe("writeFile", () => {
  it("should create file with content", async () => {
    const result = await (writeFileTool.execute as any)({
      path: TEST_FILE,
      content: "Hello from Mastra tools!",
    });

    expect(result.success).toBe(true);
    expect(result.path).toBe(TEST_FILE);
    expect(result.bytesWritten).toBe(24);
  });

  it("should auto-create directories", async () => {
    const deepFile = `${TEST_DIR}/deep/nested/file.txt`;
    const result = await (writeFileTool.execute as any)({
      path: deepFile,
      content: "deep",
    });

    expect(result.success).toBe(true);
  });

  it("should append to existing file", async () => {
    const result = await (writeFileTool.execute as any)({
      path: TEST_FILE,
      content: "\nAppended line!",
      append: true,
    });

    expect(result.success).toBe(true);
    expect(result.bytesWritten).toBe(15);
  });
});

describe("readFile", () => {
  it("should read file content", async () => {
    const result = await (readFileTool.execute as any)({
      path: TEST_FILE,
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain("Hello from Mastra tools!");
    expect(result.content).toContain("Appended line!");
    expect(result.totalLines).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("should truncate with maxLines", async () => {
    const result = await (readFileTool.execute as any)({
      path: TEST_FILE,
      maxLines: 1,
    });

    expect(result.success).toBe(true);
    expect(result.content).toBe("Hello from Mastra tools!");
    expect(result.truncated).toBe(true);
    expect(result.totalLines).toBe(2);
  });

  it("should throw on non-existent file", async () => {
    await expect(
      (readFileTool.execute as any)({ path: "/tmp/no-such-file.txt" })
    ).rejects.toThrow();
  });
});

describe("execCommand", () => {
  it("should execute command and return output", async () => {
    const result = await (execCommandTool.execute as any)({
      command: `wc -l ${TEST_FILE}`,
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toContain("hello.txt");
    expect(result.exitCode).toBe(0);
  });

  it("should respect cwd parameter", async () => {
    const result = await (execCommandTool.execute as any)({
      command: "ls -la",
      cwd: TEST_DIR,
    });

    expect(result.success).toBe(true);
    expect(result.stdout).toContain("hello.txt");
  });

  it("should return non-zero exit code on failure", async () => {
    const result = await (execCommandTool.execute as any)({
      command: "exit 42",
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });

  it("should truncate long output", async () => {
    const result = await (execCommandTool.execute as any)({
      command: "seq 1 100000",
      maxOutputLength: 100,
    });

    expect(result.stdout.length).toBeLessThanOrEqual(100);
    expect(result.truncated).toBe(true);
  });
});
