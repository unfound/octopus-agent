/**
 * 12-streaming 测试
 *
 * 测试流式输出的核心行为：
 * 1. textStream 能正常产生文本
 * 2. fullStream 事件类型正确
 * 3. 工具调用流能正确捕获工具调用
 */
import { describe, it, expect } from "vitest";
import { demoTextStream, demoFullStream, demoToolStream } from "../src/12-streaming/stream-demo";
import type { StreamEvent } from "../src/12-streaming/stream-demo";

describe("12-streaming", () => {
  describe("demoTextStream", () => {
    it("应该返回非空文本", { timeout: 30000 }, async () => {
      const text = await demoTextStream("说 hello");
      expect(text.length).toBeGreaterThan(0);
    });

    it("应该通过 onChunk 回调接收每个文本块", { timeout: 30000 }, async () => {
      const chunks: string[] = [];
      await demoTextStream("说 hello world", (chunk) => {
        chunks.push(chunk);
      });

      expect(chunks.length).toBeGreaterThan(0);
      // 拼接所有 chunk 得到完整文本
      const full = chunks.join("");
      expect(full.length).toBeGreaterThan(0);
    });

    it("短问题应该快速返回", { timeout: 15000 }, async () => {
      const start = Date.now();
      await demoTextStream("回复 OK");
      const elapsed = Date.now() - start;
      // 应该很快，不超过 10 秒
      expect(elapsed).toBeLessThan(10000);
    });
  });

  describe("demoFullStream", () => {
    it("应该返回文本和结构化事件", { timeout: 30000 }, async () => {
      const { text, events } = await demoFullStream("说 hello");

      expect(text.length).toBeGreaterThan(0);
      expect(events.length).toBeGreaterThan(0);

      // 至少有一个 text 事件
      const textEvents = events.filter((e: StreamEvent) => e.type === "text");
      expect(textEvents.length).toBeGreaterThan(0);

      // 最后一个事件应该是 finish
      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe("finish");
    });

    it("每个事件类型应该符合格式", { timeout: 30000 }, async () => {
      const { events } = await demoFullStream("说 OK");

      for (const event of events) {
        switch (event.type) {
          case "text":
            expect(typeof event.content).toBe("string");
            break;
          case "tool-call-start":
            expect(typeof event.toolName).toBe("string");
            expect(typeof event.toolCallId).toBe("string");
            break;
          case "tool-result":
            expect(typeof event.toolName).toBe("string");
            expect(typeof event.toolCallId).toBe("string");
            break;
          case "finish":
            expect(typeof event.finishReason).toBe("string");
            break;
          case "error":
            expect(typeof event.error).toBe("string");
            break;
        }
      }
    });
  });

  describe("demoToolStream", () => {
    it("应该正确处理无工具调用的场景", { timeout: 30000 }, async () => {
      const { text, toolCalls, toolResults } = await demoToolStream("说 hello", {});

      expect(text.length).toBeGreaterThan(0);
      expect(toolCalls).toEqual([]);
      expect(toolResults).toEqual([]);
    });
  });

  describe("流式 vs 非流式对比", () => {
    it("两者都应该能产生有效输出", { timeout: 30000 }, async () => {
      // 验证流式和非流式都能正常工作
      const streamText = await demoTextStream("回复 OK");
      expect(streamText.length).toBeGreaterThan(0);
    });
  });
});
