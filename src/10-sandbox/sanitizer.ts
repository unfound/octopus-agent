/**
 * 敏感信息过滤器 — 自动脱敏
 *
 * 检测并替换文本中的敏感信息：
 * - API keys (sk-..., api_key=...)
 * - 密码 (password=..., passwd:...)
 * - Token (ghp_..., gho_...)
 * - 私钥 (-----BEGIN PRIVATE KEY-----)
 * - 自定义规则
 */

/** 检测到的敏感信息 */
export interface SensitiveMatch {
  type: string;       // 敏感信息类型
  start: number;      // 起始位置
  end: number;        // 结束位置
  original: string;   // 原始文本（截断显示）
  replacement: string; // 替换后的文本
}

/** 过滤规则 */
export interface SanitizeRule {
  name: string;
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}

/** 内置规则 */
const BUILTIN_RULES: SanitizeRule[] = [
  // OpenAI / Anthropic / 通用 API key
  {
    name: "api-key",
    pattern: /\b(sk-[a-zA-Z0-9]{10,})\b/g,
    replacement: "[API_KEY_REDACTED]",
  },
  // GitHub token
  {
    name: "github-token",
    pattern: /\b(ghp_[a-zA-Z0-9]{36})\b/g,
    replacement: "[GITHUB_TOKEN_REDACTED]",
  },
  // GitHub OAuth
  {
    name: "github-oauth",
    pattern: /\b(gho_[a-zA-Z0-9]{36})\b/g,
    replacement: "[GITHUB_OAUTH_REDACTED]",
  },
  // 通用密码赋值
  {
    name: "password-assign",
    pattern: /(password|passwd|pwd|secret)\s*[=:]\s*['"]?([^\s'"]{6,})['"]?/gi,
    replacement: (match) => {
      const key = match.match(/(password|passwd|pwd|secret)/i)?.[1] ?? "secret";
      return `${key}=[REDACTED]`;
    },
  },
  // Private key
  {
    name: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: "[PRIVATE_KEY_REDACTED]",
  },
  // Bearer token
  {
    name: "bearer-token",
    pattern: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g,
    replacement: "Bearer [TOKEN_REDACTED]",
  },
  // AWS access key
  {
    name: "aws-key",
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    replacement: "[AWS_KEY_REDACTED]",
  },
  // 私有 IP（可选，可能误报）
  // {
  //   name: "private-ip",
  //   pattern: /\b(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g,
  //   replacement: "[PRIVATE_IP_REDACTED]",
  // },
];

/**
 * 敏感信息过滤器
 *
 * 用法：
 * ```typescript
 * const sanitizer = new Sanitizer();
 *
 * // 检测敏感信息
 * const matches = sanitizer.detect("my api key is sk-abc123");
 * // [{ type: "api-key", start: 14, end: 23, ... }]
 *
 * // 脱敏
 * const clean = sanitizer.sanitize("my api key is sk-abc123");
 * // "my api key is [API_KEY_REDACTED]"
 * ```
 */
export class Sanitizer {
  private rules: SanitizeRule[] = [...BUILTIN_RULES];

  /** 添加自定义规则 */
  addRule(rule: SanitizeRule): void {
    this.rules.push(rule);
  }

  /** 检测文本中的敏感信息 */
  detect(text: string): SensitiveMatch[] {
    const matches: SensitiveMatch[] = [];

    for (const rule of this.rules) {
      // 重置 lastIndex（全局正则需要）
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const original = match[0];
        const replacement =
          typeof rule.replacement === "function"
            ? rule.replacement(original)
            : rule.replacement;

        matches.push({
          type: rule.name,
          start: match.index,
          end: match.index + original.length,
          original: original.length > 20
            ? original.slice(0, 10) + "..." + original.slice(-5)
            : original,
          replacement,
        });
      }
    }

    return matches;
  }

  /** 对文本进行脱敏 */
  sanitize(text: string): string {
    let result = text;

    for (const rule of this.rules) {
      const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
      result = result.replace(pattern, (match) => {
        return typeof rule.replacement === "function"
          ? rule.replacement(match)
          : rule.replacement;
      });
    }

    return result;
  }

  /** 检查文本是否包含敏感信息 */
  hasSensitiveInfo(text: string): boolean {
    return this.detect(text).length > 0;
  }

  /** 获取所有规则 */
  getRules(): SanitizeRule[] {
    return [...this.rules];
  }
}

/** 创建文件内容过滤器（读取文件时自动脱敏） */
export function createFileSanitizer(): Sanitizer {
  const sanitizer = new Sanitizer();

  // 文件场景下额外的规则
  sanitizer.addRule({
    name: "env-file-content",
    pattern: /^[A-Z_]+=.+$/gm,
    replacement: (match) => {
      const [key] = match.split("=", 1);
      // 常见敏感 key
      const sensitiveKeys = ["KEY", "SECRET", "TOKEN", "PASSWORD", "CREDENTIAL", "PRIVATE"];
      const isSensitive = sensitiveKeys.some((k) => key.toUpperCase().includes(k));
      return isSensitive ? `${key}=[REDACTED]` : match;
    },
  });

  return sanitizer;
}
