/**
 * 读文件工具
 *
 * 读取指定路径的文件内容，支持限制行数
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { readFile } from "fs/promises";

const inputSchema = z.object({
  path: z.string().describe("文件路径（绝对或相对路径）"),
  encoding: z
    .enum(["utf-8", "latin1", "base64"])
    .optional()
    .describe("文件编码，默认 utf-8"),
  maxLines: z
    .number()
    .optional()
    .describe("最大读取行数，不填则读取全部"),
});

const outputSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  content: z.string(),
  totalLines: z.number(),
  truncated: z.boolean(),
});

async function readFileContent(
  filePath: string,
  encoding: BufferEncoding = "utf-8",
  maxLines?: number
) {
  const raw = await readFile(filePath, encoding);
  const lines = raw.split("\n");
  const truncated = maxLines != null && lines.length > maxLines;
  const content = maxLines != null ? lines.slice(0, maxLines).join("\n") : raw;

  return {
    success: true,
    path: filePath,
    content,
    totalLines: lines.length,
    truncated,
  };
}

export const readFileTool = createTool({
  id: "readFile",
  description: "读取文件内容。可以指定编码和最大行数，适合查看代码、配置文件、日志等。",
  inputSchema,
  outputSchema,
  execute: async ({ path, encoding, maxLines }) => {
    return await readFileContent(path, encoding, maxLines);
  },
});
