# 07 - 可复用技能

> 让 Agent 自动发现和加载匹配的技能 — 参考 Hermes 的实现

## 核心问题

Agent 的能力不应该写死在代码里。我们需要一个机制让 Agent 能**动态扩展能力**：
- 新增技能不需要改 Agent 代码
- Agent 能自动判断需要哪个技能
- 技能是结构化的指令，不是简单的 prompt 片段

## 解决方案

### 设计哲学（参考 Hermes / Agent Skills 标准）

核心思路：**所有主流 Agent 框架都用同一个模式**——

1. 扫描技能目录，提取 `{name, description}`
2. 把技能列表注入 **system prompt**
3. **主 Agent 自己判断**哪个技能匹配（不需要辅助 LLM）
4. 通过 tool call **加载**完整 SKILL.md
5. 在指令指导下执行

```
system prompt = 基础指令 + 技能索引
  │
  │  <available_skills>
  │    - git-commit: 生成规范的 commit message
  │    - code-review: 代码审查
  │  </available_skills>
  │
用户: "帮我写个 commit message"
  ↓
Agent 判断 → 匹配 git-commit
  ↓
Agent 调用 skillView("git-commit")
  ↓
SKILL.md 完整内容注入对话
  ↓
Agent 按 Conventional Commits 规范生成
```

### SKILL.md 格式

```markdown
---
name: git-commit
description: 生成规范的 commit message，遵循 Conventional Commits 规范
---

# Git Commit Message 专家

你是一个 git commit message 专家...
（完整指令）
```

YAML frontmatter 提供元数据（name, description），正文是完整指令。

### 为什么不调辅助 LLM 选技能？

| | 辅助 LLM 选择 | Agent 自主选择 |
|---|---|---|
| 额外 LLM 调用 | 每次对话多一次 | 零次 |
| 决策质量 | 取决于辅助 LLM | 取决于主 Agent |
| 实现复杂度 | 需要解析返回值 | 只需拼字符串 |

把 `{name, description}` 注入 system prompt 就够了——Agent 本身就有能力判断"用户的任务是否匹配某个技能描述"。

## 代码结构

```
src/07-skill/
├── skill.ts          # 技能加载器（扫描、解析 frontmatter、格式化 prompt）
├── agent.ts          # 带技能系统的 Agent（ReAct + 记忆 + skillView tool）
├── chat.ts           # 交互式对话入口
├── skills/           # 示例技能
│   ├── git-commit/
│   │   └── SKILL.md
│   └── code-review/
│       └── SKILL.md
└── README.md
```

## 运行

```bash
# 交互式对话
npx tsx src/07-skill/chat.ts
```

## 测试方式

1. 输入「帮我写一个 commit message，改动是加了用户登录功能」
   —— Agent 应该先用 skillView 加载 git-commit 技能，再按 Conventional Commits 格式生成
2. 输入「帮我审查这段代码：const x: any = JSON.parse(input)」
   —— Agent 应该加载 code-review 技能，按审查格式给出反馈
3. 输入「1+1 等于几？」
   —— Agent 不需要加载任何技能，直接回答
4. `/exit` 退出

## 扩展技能

新增技能只需在 `skills/` 下创建目录和 `SKILL.md`：

```
skills/
└── my-skill/
    └── SKILL.md    # 包含 YAML frontmatter + 指令正文
```

下次启动时自动扫描发现，无需修改任何代码。
