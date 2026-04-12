/**
 * 07 - 带技能系统的交互式对话
 *
 * Agent 能自动发现并加载匹配的技能
 *
 * 运行方式：npx tsx src/07-skill/chat.ts
 *
 * 测试方式：
 *   1. 输入「帮我写一个 commit message，改动是加了用户登录功能」
 *      —— Agent 应该先用 skillView 加载 git-commit 技能，再按 Conventional Commits 格式生成
 *   2. 输入「帮我审查这段代码：const x: any = JSON.parse(input)」
 *      —— Agent 应该加载 code-review 技能，按审查格式给出反馈
 *   3. 输入「1+1 等于几？」
 *      —— Agent 不需要加载任何技能，直接回答
 *   4. /exit 退出
 */

import { Agent } from "./agent";
import { interactiveChat } from "../shared/interactive";
import { createFileLogHooks } from "./hooks";

const MODEL_ID = "local/qwen/qwen3.5-9b";
const SKILLS_DIR = new URL("./skills", import.meta.url).pathname;

async function main() {
  // 启用文件日志（同时输出到控制台）
  const hooks = createFileLogHooks({
    prefix: "07-skill",
    console: true,
  });

  const agent = new Agent({
    model: MODEL_ID,
    skillsDir: SKILLS_DIR,
    hooks,
    name: "skill-agent",
  });

  const stats = agent.getStats();
  console.log(`📦 已加载 ${stats.skills.length} 个技能: ${stats.skills.join(", ")}\n`);

  await interactiveChat(
    (msg) => agent.send(msg),
    {
      welcome:
        "🐙 07 - 带技能系统的 Agent\n" +
        "   Agent 能自动发现并加载匹配的技能\n" +
        "   可用技能: git-commit, code-review\n" +
        "   /exit 退出\n",
    },
  );

  console.log("📊 最终统计:", agent.getStats());
}

main().catch(console.error);
