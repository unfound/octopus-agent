/**
 * 07 - 带技能系统的 Agent
 *
 * 在 03 的 ReAct + 记忆基础上，加入技能系统：
 * 1. 启动时扫描 skills/ 目录，构建技能索引
 * 2. 技能索引注入 system prompt
 * 3. Agent 自己判断是否需要加载技能
 * 4. 通过 skillView tool 加载完整 SKILL.md
 *
 * 核心流程：
 *   system prompt = 基础指令 + 技能索引 + 工具说明
 *   用户说 "帮我写个 commit"
 *     → Agent 看到技能索引里有 git-commit
 *     → Agent 调用 skillView("git-commit")
 *     → 返回 SKILL.md 内容，注入对话
 *     → Agent 按指令生成 commit message
 */

import {
  generateText,
  tool,
  type ModelMessage,
  type ToolResultPart,
  type JSONValue,
} from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";
import { MessageStore } from "../shared/message-store";
import {
  WindowManager,
  type WindowStrategy,
  slidingWindow,
} from "../03-memory/window";
import { tools as baseTools } from "../02-tool-system/tools";
import { scanSkills, formatSkillsForPrompt, type Skill } from "./skill";
import { type AgentHooks, type LLMCallRecord, countRoles } from "../shared/hooks";

/** 基础系统提示词 */
const BASE_SYSTEM_PROMPT = `你是一个有用的 AI 助手。
你可以使用工具来完成任务。
如果用户的任务匹配某个可用技能，先用 skillView 加载技能指令再执行。
回答要简洁。`;

export class Agent {
  private store: MessageStore;
  private windowManager: WindowManager;
  private model: ReturnType<typeof getModel>;
  private maxTurns: number;
  private skills: Skill[];
  private loadedSkills: Set<string> = new Set();
  private hooks?: AgentHooks;
  private callCounter: number = 0;
  private name: string;

  constructor(
    opts: {
      model?: string;
      strategy?: WindowStrategy;
      maxTurns?: number;
      systemPrompt?: string;
      skillsDir?: string;
      hooks?: AgentHooks;
      name?: string;
    } = {},
  ) {
    this.store = new MessageStore();
    this.windowManager = new WindowManager(
      this.store,
      opts.strategy ?? slidingWindow(20),
    );
    this.maxTurns = opts.maxTurns ?? 10;
    this.model = getModel(opts.model);
    this.hooks = opts.hooks;
    this.name = opts.name ?? "agent";

    // 扫描技能
    const skillsDir = opts.skillsDir ?? new URL("./skills", import.meta.url).pathname;
    this.skills = scanSkills(skillsDir);

    // 构建 system prompt（基础指令 + 技能索引）
    const systemPrompt = opts.systemPrompt ?? BASE_SYSTEM_PROMPT;
    const skillsIndex = formatSkillsForPrompt(this.skills);

    this.store.add({
      role: "system",
      content: skillsIndex ? `${systemPrompt}\n\n${skillsIndex}` : systemPrompt,
    });
  }

  /** 获取所有已加载技能的名称 */
  getLoadedSkills(): string[] {
    return [...this.loadedSkills];
  }

  /**
   * 发送用户消息，返回助手回复
   */
  async send(userMessage: string): Promise<string> {
    this.store.add({ role: "user", content: userMessage });

    const injectedMessages = await this.windowManager.apply();
    const messages: ModelMessage[] = [
      ...injectedMessages,
      ...this.store.getMessages(),
    ];

    // 合并基础工具 + skillView 工具
    const allTools = {
      ...baseTools,
      skillView: this.buildSkillViewTool(),
    };

    let turnCount = 0;
    let finalText = "";

    while (turnCount < this.maxTurns) {
      turnCount++;
      this.callCounter++;

      // 准备请求记录
      const callIndex = this.callCounter;
      const timestamp = new Date().toISOString();
      const requestRecord = {
        callIndex,
        timestamp,
        agentName: this.name,
        request: {
          messages: [...messages],
          messageCount: messages.length,
          roleStats: countRoles(messages),
        },
      };

      // 触发 onLLMStart hook
      this.hooks?.onLLMStart?.(requestRecord);

      const startTime = Date.now();
      const result = await generateText({
        model: this.model,
        messages,
        tools: allTools,
      });
      const durationMs = Date.now() - startTime;

      // 准备完整记录
      const fullRecord: LLMCallRecord = {
        ...requestRecord,
        response: {
          text: result.text,
          toolCalls: (result.toolCalls ?? []).map(tc => ({
            toolName: tc.toolName,
            args: tc.args,
          })),
          toolResults: (result.toolResults ?? []).map(tr => ({
            toolName: tr.toolName,
            result: tr.output,
          })),
          usage: {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            totalTokens: result.usage.totalTokens ?? 0,
            reasoningTokens: result.usage.reasoningTokens,
          },
          finishReason: result.finishReason ?? "unknown",
          durationMs,
        },
      };

      // 触发 onLLMEnd hook
      this.hooks?.onLLMEnd?.(fullRecord);

      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalText = result.text;
        this.store.add({ role: "assistant", content: finalText });
        return finalText;
      }

      // 有工具调用
      messages.push({
        role: "assistant",
        content: result.text || "",
      });

      for (const tc of result.toolCalls) {
        const toolResult = result.toolResults?.find(
          (tr) => tr.toolCallId === tc.toolCallId,
        );

        // 触发 onToolCall hook
        this.hooks?.onToolCall?.(tc.toolName, tc.args);

        const toolResultPart: ToolResultPart = {
          type: "tool-result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          output: toolResult
            ? { type: "json", value: toolResult.output as JSONValue }
            : { type: "text", value: "工具执行完成" },
        };
        messages.push({ role: "tool", content: [toolResultPart] });

        // 触发 onToolResult hook
        if (toolResult) {
          this.hooks?.onToolResult?.(tc.toolName, toolResult.output);
        }
      }

      finalText = result.text;
    }

    if (!finalText) {
      finalText = "达到最大迭代次数，Agent 停止。";
      this.store.add({ role: "assistant", content: finalText });
    }

    return finalText;
  }

  /** 构建 skillView 工具 */
  private buildSkillViewTool() {
    const skills = this.skills;

    return tool({
      description: "加载技能的完整指令。当用户的任务匹配某个技能时调用。",
      inputSchema: z.object({
        name: z.string().describe("技能名称，如 git-commit、code-review"),
      }),
      execute: async ({ name }) => {
        const skill = skills.find((s) => s.name === name);
        if (!skill) {
          const available = skills.map((s) => s.name).join(", ");
          return {
            error: `技能 "${name}" 不存在。可用技能：${available}`,
          };
        }

        this.loadedSkills.add(name);

        // 把技能内容存入对话历史（作为 system 消息注入）
        const skillContent = `[Skill: ${skill.name}]\n\n${skill.body}`;
        this.store.add({ role: "system", content: skillContent });

        return {
          success: true,
          name: skill.name,
          message: `技能 "${skill.name}" 已加载。完整指令已注入对话上下文。`,
        };
      },
    });
  }

  /** 获取对话统计 */
  getStats() {
    return {
      messages: this.store.length,
      estimatedTokens: this.store.totalEstimatedTokens,
      skills: this.skills.map((s) => s.name),
      loadedSkills: this.getLoadedSkills(),
    };
  }

  /** 重置对话 */
  reset(): void {
    const systemMsg = this.store.getMessages()[0];
    this.store.clear();
    this.loadedSkills.clear();
    if (systemMsg) this.store.add(systemMsg);
  }
}
