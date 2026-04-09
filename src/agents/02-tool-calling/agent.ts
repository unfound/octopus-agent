/**
 * 带工具调用的 Agent
 *
 * 核心概念：
 * - 将工具注册到 Agent
 * - Agent 会自动判断何时调用工具
 * - ReAct 模式：思考 → 行动 → 观察 → 回答
 *
 * 本示例实现 3 个文件系统工具：
 * - readFile：读取文件内容
 * - writeFile：写入文件（自动建目录）
 * - execCommand：执行 shell 命令
 */

import { Agent } from "@mastra/core/agent";
import "dotenv/config";
import { readFileTool } from "./tools/read-file-tool";
import { writeFileTool } from "./tools/write-file-tool";
import { execCommandTool } from "./tools/exec-command-tool";

/**
 * Agent 指令
 */
const instructions = `
你是一个文件系统操作助手，具备以下能力：

1. **读取文件**（readFile）：查看代码、配置文件、日志等
2. **写入文件**（writeFile）：创建或修改文件，自动创建目录
3. **执行命令**（execCommand）：运行 shell 命令，如编译、测试、安装依赖

使用原则：
- 操作前先用 readFile 查看现有内容，避免覆盖重要数据
- 写入文件时确认路径正确
- 执行命令时注意危险操作（rm -rf 等），必要时提醒用户
- 命令输出过长时会被截断，可以通过参数调整 maxOutputLength
`;

/**
 * 获取默认模型
 */
function getDefaultModel(): string {
  return process.env.DEFAULT_MODEL || "openrouter/stepfun/step-3.5-flash";
}

/**
 * 创建带工具的 Agent
 */
export function createToolAgent(model?: string) {
  return new Agent({
    id: "file-system-assistant",
    name: "File System Assistant",
    instructions,
    model: model || getDefaultModel(),
    tools: {
      readFile: readFileTool,
      writeFile: writeFileTool,
      execCommand: execCommandTool,
    },
  });
}

// 导出默认实例
export const toolAgent = createToolAgent();
