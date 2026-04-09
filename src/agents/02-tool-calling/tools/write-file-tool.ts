/**
 * 写文件工具
 *
 * 写入内容到文件，自动创建不存在的目录
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

const inputSchema = z.object({
  path: z.string().describe("文件路径（绝对或相对路径）"),
  content: z.string().describe("要写入的内容"),
  encoding: z
    .enum(["utf-8", "latin1", "base64"])
    .optional()
    .describe("文件编码，默认 utf-8"),
  append: z
    .boolean()
    .optional()
    .describe("是否追加模式，默认 false（覆盖）"),
});

const outputSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  bytesWritten: z.number(),
  created: z.boolean(),
});

async function writeFileContent(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf-8",
  append = false
) {
  // 确保目录存在
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  // 追加或覆盖
  if (append) {
    const { appendFile } = await import("fs/promises");
    await appendFile(filePath, content, encoding);
  } else {
    await writeFile(filePath, content, encoding);
  }

  return {
    success: true,
    path: filePath,
    bytesWritten: Buffer.byteLength(content, encoding),
    created: true,
  };
}

export const writeFileTool = createTool({
  id: "writeFile",
  description:
    "写入内容到文件。自动创建不存在的目录。支持覆盖和追加两种模式。",
  inputSchema,
  outputSchema,
  execute: async ({ path, content, encoding, append }) => {
    return await writeFileContent(path, content, encoding, append);
  },
});
