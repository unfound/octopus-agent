/**
 * 权限管理器 — 控制 Agent 能做什么
 *
 * 四层权限：
 * 1. 工具权限 — 哪些工具能用
 * 2. 路径权限 — 能访问哪些文件路径
 * 3. 网络权限 — 能访问哪些域名
 * 4. 确认权限 — 哪些操作需要用户确认
 */

import { resolve, normalize } from "node:path";

/** 权限检查结果 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

/** 权限配置 */
export interface PermissionConfig {
  // 工具权限（空数组 = 不限制）
  allowedTools: string[];   // 白名单（只有这些能用）
  blockedTools: string[];   // 黑名单（这些不能用）

  // 文件路径权限
  allowedPaths: string[];   // 允许访问的路径前缀
  blockedPaths: string[];   // 禁止访问的路径

  // 网络权限
  allowedDomains: string[]; // 允许访问的域名
  blockedDomains: string[]; // 禁止访问的域名

  // 需要用户确认的工具
  requireConfirm: string[];
}

/** 默认配置：宽松但有底线 */
const DEFAULT_CONFIG: PermissionConfig = {
  allowedTools: [],         // 空 = 全部允许
  blockedTools: [],         // 默认不黑名单
  allowedPaths: [],         // 空 = 全部允许
  blockedPaths: [
    "/etc/shadow",
    "/etc/passwd",
    "~/.ssh/",
    "~/.env",
    ".env",
  ],
  allowedDomains: [],       // 空 = 全部允许
  blockedDomains: [
    "evil.com",
  ],
  requireConfirm: [
    "exec",                 // 执行命令需要确认
    "write_file",           // 写文件需要确认
  ],
};

/**
 * 权限管理器
 *
 * 用法：
 * ```typescript
 * const pm = new PermissionManager({
 *   allowedTools: ["read_file", "search_files"],
 *   blockedTools: ["exec"],
 *   allowedPaths: ["/tmp/agent-workspace"],
 * });
 *
 * pm.checkToolAccess("exec");          // { allowed: false, reason: "..." }
 * pm.checkToolAccess("read_file");     // { allowed: true }
 * pm.checkPathAccess("/tmp/test.txt"); // { allowed: true }
 * pm.checkPathAccess("/etc/passwd");   // { allowed: false, reason: "..." }
 * ```
 */
export class PermissionManager {
  private config: PermissionConfig;

  constructor(config: Partial<PermissionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 检查工具权限 */
  checkToolAccess(toolName: string): PermissionResult {
    // 黑名单优先
    if (this.config.blockedTools.includes(toolName)) {
      return {
        allowed: false,
        reason: `工具 "${toolName}" 在黑名单中`,
      };
    }

    // 白名单检查（空 = 全部允许）
    if (this.config.allowedTools.length > 0) {
      if (!this.config.allowedTools.includes(toolName)) {
        return {
          allowed: false,
          reason: `工具 "${toolName}" 不在白名单中。允许: ${this.config.allowedTools.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  /** 检查路径权限 */
  checkPathAccess(path: string): PermissionResult {
    const normalized = normalize(resolve(path));

    // 黑名单检查
    for (const blocked of this.config.blockedPaths) {
      const blockedResolved = normalize(resolve(blocked.replace("~", process.env.HOME ?? "/home")));
      if (normalized.startsWith(blockedResolved) || normalized === blockedResolved) {
        return {
          allowed: false,
          reason: `路径 "${path}" 被禁止访问（匹配黑名单: ${blocked}）`,
        };
      }
    }

    // 白名单检查（空 = 全部允许）
    if (this.config.allowedPaths.length > 0) {
      const inAllowed = this.config.allowedPaths.some((allowed) => {
        const allowedResolved = normalize(resolve(allowed));
        return normalized.startsWith(allowedResolved);
      });

      if (!inAllowed) {
        return {
          allowed: false,
          reason: `路径 "${path}" 不在允许范围内。允许: ${this.config.allowedPaths.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  /** 检查网络权限 */
  checkNetworkAccess(url: string): PermissionResult {
    let domain: string;
    try {
      domain = new URL(url).hostname;
    } catch {
      return {
        allowed: false,
        reason: `无效的 URL: ${url}`,
      };
    }

    // 黑名单检查
    for (const blocked of this.config.blockedDomains) {
      if (domain === blocked || domain.endsWith(`.${blocked}`)) {
        return {
          allowed: false,
          reason: `域名 "${domain}" 被禁止访问`,
        };
      }
    }

    // 白名单检查（空 = 全部允许）
    if (this.config.allowedDomains.length > 0) {
      const inAllowed = this.config.allowedDomains.some((allowed) => {
        return domain === allowed || domain.endsWith(`.${allowed}`);
      });

      if (!inAllowed) {
        return {
          allowed: false,
          reason: `域名 "${domain}" 不在允许范围内。允许: ${this.config.allowedDomains.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  /** 检查工具是否需要用户确认 */
  requiresConfirm(toolName: string): boolean {
    return this.config.requireConfirm.includes(toolName);
  }

  /** 获取当前配置 */
  getConfig(): PermissionConfig {
    return { ...this.config };
  }

  /** 更新配置 */
  updateConfig(partial: Partial<PermissionConfig>): void {
    this.config = { ...this.config, ...partial };
  }
}

/** 创建只读权限配置（适合子代理） */
export function createReadOnlyPermissions(): Partial<PermissionConfig> {
  return {
    allowedTools: ["read_file", "search_files", "web_search", "web_extract"],
    blockedTools: ["exec", "write_file", "patch"],
    requireConfirm: [],
  };
}

/** 创建沙箱权限配置（限制在临时目录） */
export function createSandboxPermissions(workspace: string): Partial<PermissionConfig> {
  return {
    blockedTools: ["exec"],  // 禁止执行命令
    allowedPaths: [workspace],
    requireConfirm: ["write_file", "patch"],
  };
}
