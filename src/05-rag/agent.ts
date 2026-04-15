/**
 * 05 - 带 RAG 的 Agent
 *
 * 在 02 的工具系统基础上增加检索增强生成：
 * - 对话前：自动检索知识库，注入 system prompt
 * - 工具：search_knowledge 让 agent 主动搜索
 *
 * 对比 04-long-term：
 * - 04: BM25 检索用户记忆（对话中提取的）
 * - 05: Embedding 检索外部文档（预先导入的）
 */

import { generateText, tool, type ModelMessage, type ToolResultPart, type JSONValue } from "ai";
import { z } from "zod";
import { getModel } from "../shared/model";
import { MessageStore } from "../shared/message-store";
import { tools as baseTools } from "../02-tool-system/tools";
import { Rag } from "./rag";
import { type AgentHooks, type LLMCallRecord, countRoles } from "../shared/hooks";

const SYSTEM_PROMPT = `你是一个有用的 AI 助手，名叫 Octopus。
你可以使用工具来完成任务。
当用户的问题涉及知识库中的内容时，优先使用 search_knowledge 工具检索相关信息。
回答要简洁。`;

export class Agent {
  private store: MessageStore;
  private model: ReturnType<typeof getModel>;
  private rag: Rag;
  private maxTurns: number;
  private hooks?: AgentHooks;
  private callCounter: number = 0;

  constructor(opts: {
    model?: string;
    maxTurns?: number;
    systemPrompt?: string;
    storePath?: string;
    topK?: number;
    hooks?: AgentHooks;
  } = {}) {
    this.store = new MessageStore();
    this.maxTurns = opts.maxTurns ?? 10;
    this.model = getModel(opts.model);
    this.hooks = opts.hooks;
    this.rag = new Rag({
      storePath: opts.storePath ?? "./data/vectors.jsonl",
      topK: opts.topK ?? 3,
    });

    this.store.add({
      role: "system",
      content: opts.systemPrompt ?? SYSTEM_PROMPT,
    });
  }

  /** 初始化（加载向量索引） */
  async init(): Promise<void> {
    await this.rag.init();
  }

  /** 索引一个文件到知识库 */
  async indexFile(filePath: string): Promise<number> {
    return this.rag.indexFile(filePath);
  }

  /** 索引一段文本到知识库 */
  async indexText(text: string, source: string): Promise<number> {
    return this.rag.indexText(text, source);
  }

  /**
   * 获取工具集（基础工具 + searchKnowledge）
   */
  private getTools() {
    const searchKnowledge = tool({
      description: "搜索知识库。当用户问题需要查阅文档或资料时使用。",
      inputSchema: z.object({
        query: z.string().describe("搜索查询"),
        topK: z.number().optional().describe("返回结果数量（默认 3）"),
      }),
      execute: async ({ query, topK }) => {
        const results = await this.rag.retrieve(query, topK ?? 3);
        if (results.length === 0) {
          return { found: false, message: "知识库中没有找到相关信息。" };
        }
        return {
          found: true,
          results: results.map((r) => ({
            source: r.entry.metadata.source,
            score: r.score.toFixed(3),
            text: r.entry.text,
          })),
        };
      },
    });

    return {
      ...baseTools,
      searchKnowledge,
    };
  }

  /**
   * 发送用户消息，返回助手回复
   *
   * 流程：
   * 1. 检索知识库 → 注入 system prompt
   * 2. ReAct 循环（带工具）
   */
  async send(userMessage: string): Promise<string> {
    // ═══ 1. 自动检索知识库 ═══
    const results = await this.rag.retrieve(userMessage, 3);
    if (results.length > 0) {
      const context = this.rag.formatContext(results);
      this.store.add({ role: "system", content: context });
    }

    // ═══ 2. 存用户消息 ═══
    this.store.add({ role: "user", content: userMessage });
    const messages = this.store.getMessages();
    const tools = this.getTools();

    // ═══ 3. ReAct 循环 ═══
    let turnCount = 0;
    let finalText = "";

    while (turnCount < this.maxTurns) {
      turnCount++;
      this.callCounter++;

      const callIndex = this.callCounter;
      const timestamp = new Date().toISOString();

      // 触发 onLLMStart hook
      const requestRecord = {
        callIndex,
        timestamp,
        agentName: "rag-agent",
        request: {
          messages: [...messages],
          messageCount: messages.length,
          roleStats: countRoles(messages),
        },
      };
      this.hooks?.onLLMStart?.(requestRecord);

      const startTime = Date.now();
      const result = await generateText({ model: this.model, messages, tools });
      const durationMs = Date.now() - startTime;

      // 触发 onLLMEnd hook
      const fullRecord: LLMCallRecord = {
        ...requestRecord,
        response: {
          text: result.text,
          toolCalls: (result.toolCalls ?? []).map(tc => ({
            toolName: tc.toolName,
            args: tc.input,
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
      this.hooks?.onLLMEnd?.(fullRecord);

      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalText = result.text;
        this.store.add({ role: "assistant", content: finalText });
        break;
      }

      // 工具调用
      messages.push({
        role: "assistant",
        content: result.text || "",
      });

      for (const tc of result.toolCalls) {
        const toolResult = result.toolResults?.find(
          (tr) => tr.toolCallId === tc.toolCallId,
        );

        // 触发 onToolCall hook
        this.hooks?.onToolCall?.(tc.toolName, tc.input);

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

  /** 获取对话统计 */
  getStats() {
    return {
      messages: this.store.length,
      estimatedTokens: this.store.totalEstimatedTokens,
      indexedChunks: this.rag.size,
    };
  }

  /** 重置对话 */
  reset(): void {
    const systemMsg = this.store.getMessages()[0];
    this.store.clear();
    if (systemMsg) this.store.add(systemMsg);
  }
}
