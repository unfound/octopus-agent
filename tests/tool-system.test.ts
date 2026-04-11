/**
 * 02-tool-system 工具测试
 *
 * 直接测试工具函数的 execute 逻辑
 * Vercel AI SDK 的 tool() 返回的对象有 execute 方法可以直接调用
 *
 * 运行方式：
 * npx vitest run tests/tool-system.test.ts
 */

import { describe, it, expect } from "vitest";
import { readFileTool, writeFileTool, execCommandTool } from "../src/02-tool-system/tools";

const TEST_DIR = "/tmp/agent-test-tools";
const TEST_FILE = `${TEST_DIR}/hello.txt`;

describe("writeFile", () => {
  it("should create file with content", async () => {
    const result = await writeFileTool.execute(
      { path: TEST_FILE, content: "Hello from Agent!" },
      {} as any
    );

    expect(result.success).toBe(true);
    expect(result.path).toBe(TEST_FILE);
    expect(result.bytesWritten).toBe(17);
  });

  it("should auto-create directories", async () => {
    const deepFile = `${TEST_DIR}/deep/nested/file.txt`;
    const result = await writeFileTool.execute(
      { path: deepFile, content: "deep" },
      {} as any
    );

    expect(result.success).toBe(true);
  });
});

describe("readFile", () => {
  it("should read file content", async () => {
    const result = await readFileTool.execute(
      { path: TEST_FILE },
      {} as any
    );

    expect(result.content).toContain("Hello from Agent!");
    expect(result.totalLines).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it("should truncate with maxLines", async () => {
    // 先写一个多行文件
    await writeFileTool.execute(
      { path: `${TEST_DIR}/multi.txt`, content: "line1\nline2\nline3" },
      {} as any
    );

    const result = await readFileTool.execute(
      { path: `${TEST_DIR}/multi.txt`, maxLines: 1 },
      {} as any
    );

    expect(result.content).toBe("line1");
    expect(result.truncated).toBe(true);
    expect(result.totalLines).toBe(3);
  });

  it("should return error on non-existent file", async () => {
    const result = await readFileTool.execute(
      { path: "/tmp/no-such-file.txt" },
      {} as any,
    );
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("不存在");
  });
});

describe("execCommand", () => {
  it("should execute command and return output", async () => {
    const result = await execCommandTool.execute(
      { command: "echo hello" },
      {} as any
    );

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  it("should respect cwd parameter", async () => {
    const result = await execCommandTool.execute(
      { command: "ls", cwd: TEST_DIR },
      {} as any
    );

    expect(result.success).toBe(true);
    expect(result.stdout).toContain("hello.txt");
  });

  it("should return non-zero exit code on failure", async () => {
    const result = await execCommandTool.execute(
      { command: "exit 42" },
      {} as any
    );

    expect(result.success).toBe(false);
    expect(result.exitCode).not.toBe(0);
  });
});
