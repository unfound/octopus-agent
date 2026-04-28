# 13 - Structured Output（结构化输出）

## 为什么需要结构化输出？

前面所有章节，Agent 的输出都是**自由文本**：

```
"代码中有 3 个问题：1. 变量未定义 2. 类型错误 3. 缺少错误处理"
```

但实际系统需要的是**结构化数据**：

```json
{
  "issues": [
    { "line": 5, "severity": "error", "message": "变量未定义" },
    { "line": 10, "severity": "warning", "message": "类型错误" }
  ],
  "score": 7
}
```

自由文本 → 正则提取 → 容易出错。结构化输出 → Zod schema → 类型安全。

## 核心问题

```typescript
// ❌ 这样做脆弱且不可靠
const text = await generateText({ prompt: "分析代码，返回 JSON" });
const result = JSON.parse(text); // 可能解析失败，格式可能不对
```

```typescript
// ✅ generateObject 保证输出符合 Schema
const { object } = await generateObject({
  model: getModel(),
  schema: z.object({ issues: z.array(IssueSchema), score: z.number() }),
  prompt: "分析这段代码",
});
// object 类型是 { issues: Issue[], score: number } — 完全类型安全
```

## Vercel AI SDK 的方案

| API | 返回 | 用途 |
|-----|------|------|
| `generateObject` | `{ object: T }` | 生成符合 Schema 的对象 |
| `streamObject` | `{ partialObjectStream }` | 流式生成结构化对象 |

关键：Zod schema 会被自动转成 JSON Schema，发给 LLM 约束输出。

## 文件结构

```
13-structured-output/
├── README.md              ← 本文件
├── schemas.ts             # Zod schema 定义（代码审查、分类、提取等）
├── generate.ts            # generateObject 核心实现
├── stream-object.ts       # streamObject 流式结构
├── repair.ts              # 输出修复：当 LLM 输出不符合 schema 时
└── chat.ts                # 交互入口
```

## 设计要点

### 1. 基础用法：generateObject

```typescript
import { generateObject } from "ai";
import { z } from "zod";

const { object } = await generateObject({
  model: getModel(),
  schema: z.object({
    name: z.string().describe("人物姓名"),
    age: z.number().describe("年龄"),
    skills: z.array(z.string()).describe("技能列表"),
  }),
  prompt: "描述一个虚构的程序员",
});

// object 的类型是 { name: string; age: number; skills: string[] }
console.log(object.name);  // "张三"
console.log(object.skills); // ["TypeScript", "Rust", "系统设计"]
```

### 2. 嵌套结构：复杂 Schema

```typescript
const CodeReviewSchema = z.object({
  summary: z.string().describe("代码整体评估"),
  issues: z.array(z.object({
    line: z.number().describe("问题所在行号"),
    severity: z.enum(["error", "warning", "info"]),
    category: z.enum(["bug", "style", "performance", "security"]),
    message: z.string(),
    suggestion: z.string().optional(),
  })),
  score: z.number().min(1).max(10).describe("代码质量评分"),
});
```

### 3. streamObject：流式结构化输出

```typescript
const { partialObjectStream } = streamObject({
  model: getModel(),
  schema: CodeReviewSchema,
  prompt: "审查这段代码",
});

// 对象逐步构建，每个 chunk 是当前的部分对象
for await (const partial of partialObjectStream) {
  console.log(partial); // { issues: [{ line: 5, ... }], score: undefined }
}
```

### 4. 输出修复

当 LLM 输出不符合 Schema 时（如 score 应该是 number 但 LLM 返回了 string "7"），`generateObject` 会自动尝试修复。也可以手动处理：

```typescript
try {
  const { object } = await generateObject({ schema, prompt });
} catch (error) {
  // 自动修复失败时会抛错
  console.error("Schema 验证失败:", error);
}
```

## Demo 场景

1. **代码审查** — 输入代码，输出结构化 Issues 列表
2. **信息提取** — 从自然语言中提取结构化信息
3. **分类器** — 把文本分类为预定类别
4. **流式构建** — streamObject 看对象逐步成型

## 与前面章节的关系

- **02-tool-system**：结构化输出 + 工具调用结合，工具参数也可以用 Zod schema
- **05-rag**：检索结果的结构化表示
- **11-evaluation**：结构化输出让评估更精确（直接比较字段而非关键词）
