/**
 * 执行命令行工具
 *
 * 执行 shell 命令并返回输出，支持超时和工作目录设置
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { exec } from "child_process";

const inputSchema = z.object({
  command: z.string().describe("要执行的 shell 命令"),
  cwd: z.string().optional().describe("工作目录，默认当前目录"),
  timeout: z
    .number()
    .optional()
    .describe("超时时间（毫秒），默认 30000（30秒）"),
  maxOutputLength: z
    .number()
    .optional()
    .describe("最大输出字符数，默认 10000，超出截断"),
});

const outputSchema = z.object({
  success: z.boolean(),
  command: z.string(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  truncated: z.boolean(),
});

function runCommand(
  command: string,
  cwd?: string,
  timeout = 30000,
  maxOutput = 10000
): Promise<{
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
}> {
  return new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout, encoding: "utf-8", maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const rawStdout = stdout || "";
        const rawStderr = stderr || "";
        const truncated =
          rawStdout.length > maxOutput || rawStderr.length > maxOutput;

        resolve({
          success: !error,
          command,
          stdout: rawStdout.slice(0, maxOutput),
          stderr: rawStderr.slice(0, maxOutput),
          exitCode: error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0,
          truncated,
        });
      }
    );
  });
}

export const execCommandTool = createTool({
  id: "execCommand",
  description:
    "执行 shell 命令。返回 stdout、stderr 和退出码。适合运行编译、测试、文件操作等。",
  inputSchema,
  outputSchema,
  execute: async ({ command, cwd, timeout, maxOutputLength }) => {
    return await runCommand(command, cwd, timeout, maxOutputLength);
  },
});
