/**
 * 工具包装器 — 给现有工具加权限层
 *
 * 把 PermissionManager + Sanitizer + ConfirmMiddleware 组合起来
 * 透明地包装现有工具，不改变原始工具定义
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { PermissionManager } from "./permissions";
import { Sanitizer } from "./sanitizer";
import type { ConfirmResult } from "./confirm";

/** 包装器配置 */
export interface WrapperConfig {
  permissions?: PermissionManager;
  sanitizer?: Sanitizer;
  /** 确认回调 */
  onConfirm?: (toolName: string, input: unknown) => Promise<ConfirmResult>;
  /** 输出过滤：对工具返回值脱敏 */
  sanitizeOutput?: boolean;
}

/**
 * 包装工具集
 *
 * 用法：
 * ```typescript
 * import { tools } from "../02-tool-system/tools";
 * import { wrapTools } from "./wrapper";
 *
 * const safeTools = wrapTools(tools, {
 *   permissions: new PermissionManager({ blockedTools: ["exec"] }),
 *   sanitizer: new Sanitizer(),
 *   sanitizeOutput: true,
 * });
 * ```
 */
export function wrapTools(
  tools: ToolSet,
  config: WrapperConfig = {},
): ToolSet {
  const {
    permissions = new PermissionManager(),
    sanitizer = new Sanitizer(),
    onConfirm,
    sanitizeOutput = false,
  } = config;

  const wrapped: ToolSet = {};

  for (const [name, toolDef] of Object.entries(tools)) {
    wrapped[name] = wrapSingleTool(name, toolDef, {
      permissions,
      sanitizer,
      onConfirm,
      sanitizeOutput,
    });
  }

  return wrapped;
}

/** 包装单个工具 */
function wrapSingleTool(
  name: string,
  toolDef: any,
  config: Required<Pick<WrapperConfig, "permissions" | "sanitizer">> &
    Pick<WrapperConfig, "onConfirm" | "sanitizeOutput">,
): any {
  const { permissions, sanitizer, onConfirm, sanitizeOutput } = config;

  return {
    ...toolDef,
    execute: async (input: unknown) => {
      // 1. 检查工具权限
      const toolAccess = permissions.checkToolAccess(name);
      if (!toolAccess.allowed) {
        throw new Error(`权限拒绝: ${toolAccess.reason}`);
      }

      // 2. 检查路径权限（如果输入包含 path）
      if (typeof input === "object" && input !== null && "path" in input) {
        const pathAccess = permissions.checkPathAccess((input as { path: string }).path);
        if (!pathAccess.allowed) {
          throw new Error(`权限拒绝: ${pathAccess.reason}`);
        }
      }

      // 3. 检查网络权限（如果输入包含 url）
      if (typeof input === "object" && input !== null && "url" in input) {
        const urlAccess = permissions.checkNetworkAccess((input as { url: string }).url);
        if (!urlAccess.allowed) {
          throw new Error(`权限拒绝: ${urlAccess.reason}`);
        }
      }

      // 4. 检查是否需要确认
      if (onConfirm && permissions.requiresConfirm(name)) {
        const result = await onConfirm(name, input);
        if (result === "deny") {
          throw new Error(`用户拒绝执行工具 "${name}"`);
        }
      }

      // 5. 执行原始工具
      let output = await toolDef.execute(input);

      // 6. 输出脱敏
      if (sanitizeOutput && typeof output === "string") {
        output = sanitizer.sanitize(output);
      } else if (sanitizeOutput && typeof output === "object" && output !== null) {
        output = JSON.parse(sanitizer.sanitize(JSON.stringify(output)));
      }

      return output;
    },
  };
}

/** 创建安全工具集的快捷方式 */
export function createSafeTools(
  tools: ToolSet,
  options: {
    /** 只读模式：只允许读取类工具 */
    readOnly?: boolean;
    /** 沙箱路径：限制在指定目录 */
    sandboxPath?: string;
    /** 额外禁止的工具 */
    blockedTools?: string[];
    /** 是否脱敏输出 */
    sanitizeOutput?: boolean;
    /** 确认回调 */
    onConfirm?: (toolName: string, input: unknown) => Promise<ConfirmResult>;
  } = {},
): ToolSet {
  const { readOnly, sandboxPath, blockedTools = [], sanitizeOutput = true, onConfirm } = options;

  // 构建权限配置
  const permConfig: ConstructorParameters<typeof PermissionManager>[0] = {
    blockedTools,
  };

  if (readOnly) {
    permConfig.allowedTools = ["read_file", "search_files", "web_search", "web_extract"];
  }

  if (sandboxPath) {
    permConfig.allowedPaths = [sandboxPath];
  }

  return wrapTools(tools, {
    permissions: new PermissionManager(permConfig),
    sanitizer: new Sanitizer(),
    sanitizeOutput,
    onConfirm,
  });
}
