/**
 * 记忆持久化 — JSONL 格式
 *
 * 每条记忆一行 JSON（JSON Lines），追加写入，不需要每次重写整个文件。
 *
 * 优势（对比 OpenClaw 的单 .md 文件）：
 * - 追加写入 O(1)，不需要每次读写整个文件
 * - 支持增量加载，内存里有结构化的条目
 * - grep / wc -l 直接能调试
 * - 可以按 ID 删除/更新（需要重写文件，但很少发生）
 */

import { readFile, appendFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";
import type { MemoryEntry } from "./memory-entry";

export class MemoryStore {
  private entries: Map<string, MemoryEntry> = new Map();
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** 从 JSONL 文件加载所有记忆 */
  async load(): Promise<void> {
    if (!existsSync(this.filePath)) return;

    const content = await readFile(this.filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as MemoryEntry;
        this.entries.set(entry.id, entry);
      } catch {
        // 跳过损坏的行
      }
    }
  }

  /** 添加一条记忆（追加到 JSONL 文件） */
  async add(entry: MemoryEntry): Promise<void> {
    this.entries.set(entry.id, entry);
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, JSON.stringify(entry) + "\n", "utf-8");
  }

  /** 批量添加 */
  async addAll(entries: MemoryEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const lines = entries.map((e) => {
      this.entries.set(e.id, e);
      return JSON.stringify(e);
    });
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, lines.join("\n") + "\n", "utf-8");
  }

  /** 获取单条记忆 */
  get(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  /** 获取所有记忆 */
  getAll(): MemoryEntry[] {
    return [...this.entries.values()];
  }

  /** 按分类获取 */
  getByCategory(category: MemoryEntry["category"]): MemoryEntry[] {
    return this.getAll().filter((e) => e.category === category);
  }

  /** 更新记忆（重写整个文件） */
  async update(id: string, patch: Partial<MemoryEntry>): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    Object.assign(entry, patch);
    await this.flush();
  }

  /** 标记访问 */
  async markAccessed(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    // 访问不重写文件，只改内存
  }

  /** 删除记忆 */
  async delete(id: string): Promise<void> {
    this.entries.delete(id);
    await this.flush();
  }

  /** 记忆总数 */
  get size(): number {
    return this.entries.size;
  }

  /** 把内存中的所有记忆重写到 JSONL 文件（用于删除/更新后同步） */
  private async flush(): Promise<void> {
    const lines = [...this.entries.values()].map((e) => JSON.stringify(e));
    await writeFile(this.filePath, lines.join("\n") + "\n", "utf-8");
  }
}
