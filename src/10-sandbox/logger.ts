/**
 * 安全事件日志记录器
 *
 * 记录权限拦截、脱敏等安全事件到文件
 * 用于事后审计和分析
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import type { SecurityEvent } from "./wrapper";

/** 日志条目 */
export interface LogEntry extends SecurityEvent {
  /** 额外上下文 */
  context?: Record<string, unknown>;
}

/**
 * 安全事件日志记录器
 *
 * 用法：
 * ```typescript
 * import { createSecurityLogger } from "./logger";
 *
 * const logger = createSecurityLogger({
 *   logDir: "./logs",
 *   prefix: "security",
 * });
 *
 * const safeTools = createSafeTools(tools, {
 *   onSecurityEvent: logger.record,
 * });
 * ```
 */
export class SecurityLogger {
  private logFile: string;
  private entries: LogEntry[] = [];

  constructor(options: { logDir: string; prefix?: string }) {
    const { logDir, prefix = "security" } = options;

    // 确保目录存在
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    // 生成日志文件名（带时间戳）
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    this.logFile = join(logDir, `${prefix}-${timestamp}.json`);
  }

  /** 记录安全事件 */
  record = (event: SecurityEvent, context?: Record<string, unknown>): void => {
    const entry: LogEntry = { ...event, context };
    this.entries.push(entry);

    // 追加写入文件
    this.flush();

    // 同时输出到控制台
    const icon = this.getIcon(event.type);
    console.log(`${icon} [Security] ${event.toolName}: ${event.detail}`);
  };

  /** 刷新到文件 */
  private flush(): void {
    try {
      // 确保目录存在
      const dir = dirname(this.logFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.logFile, JSON.stringify(this.entries, null, 2));
    } catch (err) {
      console.error(`[SecurityLogger] 写入日志失败:`, err);
    }
  }

  /** 获取事件图标 */
  private getIcon(type: SecurityEvent["type"]): string {
    switch (type) {
      case "permission_deny": return "🚫";
      case "path_deny": return "📁";
      case "url_deny": return "🌐";
      case "sanitize": return "🔒";
      case "confirm": return "⚠️";
      default: return "📝";
    }
  }

  /** 获取日志文件路径 */
  getLogFile(): string {
    return this.logFile;
  }

  /** 获取所有记录 */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /** 获取统计摘要 */
  getSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const entry of this.entries) {
      summary[entry.type] = (summary[entry.type] ?? 0) + 1;
    }
    return summary;
  }
}

/** 创建安全日志记录器的快捷方式 */
export function createSecurityLogger(options?: {
  logDir?: string;
  prefix?: string;
}): SecurityLogger {
  const logDir = options?.logDir ?? join(process.cwd(), "logs");
  const prefix = options?.prefix ?? "security";
  return new SecurityLogger({ logDir, prefix });
}
