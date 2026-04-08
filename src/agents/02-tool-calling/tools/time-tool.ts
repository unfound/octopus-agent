/**
 * 时间工具
 *
 * 示例工具：获取当前时间
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// 输入参数 schema
const inputSchema = z.object({
  timezone: z.string().describe("时区，例如 'Asia/Shanghai' 或 'America/New_York'"),
});

// 输出 schema
const outputSchema = z.object({
  time: z.string(),
  timezone: z.string(),
  formatted: z.string(),
});

/**
 * 获取当前时间
 */
async function getCurrentTime(timezone: string): Promise<{
  time: string;
  timezone: string;
  formatted: string;
}> {
  const now = new Date();

  // 使用 Intl.DateTimeFormat 格式化时间
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return {
    time: now.toISOString(),
    timezone,
    formatted: formatter.format(now),
  };
}

// 创建工具 - 注意使用 id 而不是 name
export const timeTool = createTool({
  id: "getCurrentTime", // 使用 id
  description: "获取指定时区的当前时间",
  inputSchema,
  outputSchema,
  execute: async ({ timezone }) => {
    return await getCurrentTime(timezone);
  },
});
