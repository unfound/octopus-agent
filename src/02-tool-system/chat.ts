/**
 * 02 - 工具调用交互式对话
 *
 * 每次对话独立（无状态），演示工具调用能力
 *
 * 运行方式：npx tsx src/02-tool-system/chat.ts
 */

import { agentChat } from "./agent";
import { interactiveChat } from "../shared/interactive";

const SYSTEM_PROMPT = `你是一个文件系统操作助手，具备以下能力：
1. 读取文件（readFile）
2. 写入文件（writeFile）
3. 执行命令（execCommand）

使用原则：
- 操作前先用 readFile 查看现有内容
- 写入文件时确认路径正确
- 执行命令注意安全`;

async function main() {
  await interactiveChat(
    (msg) => agentChat(msg, { system: SYSTEM_PROMPT }),
    {
      welcome: "🐙 02 - 工具调用 Agent\n   每次对话独立（无状态），支持文件读写和命令执行\n   /exit 退出\n",
    }
  );
}

main().catch(console.error);
