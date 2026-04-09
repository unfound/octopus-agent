/**
 * 工具定义
 *
 * 使用 Vercel AI SDK 的 tool() 函数定义工具
 * tool() 做的事情：
 *   1. 用 Zod schema 描述参数 → 自动生成 JSON Schema 给 LLM
 *   2. 执行时校验输入参数
 *   3. 返回标准化的结果格式
 */

import { tool } from "ai";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { exec } from "child_process";

/**
 * 读取文件
 */
export const readFileTool = tool({
  description: "读取文件内容。可以指定最大行数。",
  inputSchema: z.object({
    path: z.string().describe("文件路径"),
    maxLines: z.number().optional().describe("最大读取行数"),
  }),
  execute: async ({ path, maxLines }) => {
    const content = await readFile(path, "utf-8");
    if (maxLines) {
      const lines = content.split("\n");
      return {
        content: lines.slice(0, maxLines).join("\n"),
        totalLines: lines.length,
        truncated: lines.length > maxLines,
      };
    }
    return { content, totalLines: content.split("\n").length, truncated: false };
  },
});

/**
 * 写入文件
 */
export const writeFileTool = tool({
  description: "写入内容到文件。自动创建不存在的目录。",
  inputSchema: z.object({
    path: z.string().describe("文件路径"),
    content: z.string().describe("要写入的内容"),
  }),
  execute: async ({ path, content }) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf-8");
    return { success: true, path, bytesWritten: Buffer.byteLength(content) };
  },
});

/**
 * 执行命令
 */
export const execCommandTool = tool({
  description: "执行 shell 命令。返回 stdout、stderr 和退出码。",
  inputSchema: z.object({
    command: z.string().describe("shell 命令"),
    cwd: z.string().optional().describe("工作目录"),
  }),
  execute: async ({ command, cwd }) => {
    return new Promise((resolve) => {
      exec(command, { cwd, timeout: 30000, encoding: "utf-8" }, (err, stdout, stderr) => {
        resolve({
          success: !err,
          stdout: (stdout || "").slice(0, 5000),
          stderr: (stderr || "").slice(0, 5000),
          exitCode: err ? (err as any).code ?? 1 : 0,
        });
      });
    });
  },
});

/**
 * 工具注册表
 *
 * 把工具收集到一个对象里，方便传给 generateText
 * key = 工具名，value = tool() 创建的工具
 */
export const tools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  execCommand: execCommandTool,
};
