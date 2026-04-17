# 11 - Evaluation（评估框架）

## 为什么需要评估？

Agent 不是写完就完了 — 改了 prompt、换了模型、加了工具，输出质量可能变差。没有评估，你根本不知道"变好了还是变差了"。

## 三层评估

```
┌─────────────────────────────────────────────────┐
│  Level 3: 回归测试（CI/CD）                      │
│  固定用例 + 预期结果，跑 Vitest                   │
├─────────────────────────────────────────────────┤
│  Level 2: LLM-as-Judge                          │
│  让另一个 LLM 打分（1-10），评估质量              │
├─────────────────────────────────────────────────┤
│  Level 1: 关键词/结构校验（零成本）               │
│  输出包含预期关键词？工具调用正确？                │
└─────────────────────────────────────────────────┘
```

## 文件结构

```
11-evaluation/
├── README.md          ← 本文件
├── scorers.ts         # 评分器：关键词匹配、结构校验、LLM-as-Judge
├── runner.ts          # 评估运行器：跑用例 → 收集结果 → 打分
├── cases/             # 测试用例
│   └── basic.json     # 基础用例示例
├── report.ts          # 生成评估报告
└── chat.ts            # 入口：运行评估
```

## 设计要点

### 1. 测试用例格式

```typescript
interface EvalCase {
  id: string;                    // 用例 ID
  name: string;                  // 用例名称
  input: string;                 // 用户输入
  expected?: {
    keywords?: string[];         // 输出应包含的关键词
    notKeywords?: string[];      // 输出不应包含的词
    toolCalls?: string[];        // 应调用的工具名
    answer?: string;             // 预期答案（用于 LLM Judge）
  };
  tags?: string[];               // 标签（分类用）
}
```

### 2. 评分器

```typescript
// Level 1: 关键词匹配
function keywordScore(output: string, expected: string[]): number;
// 返回匹配比例 0-1

// Level 1: 工具调用校验
function toolCallScore(actual: string[], expected: string[]): number;
// 返回匹配比例 0-1

// Level 2: LLM-as-Judge
async function llmJudge(input: string, output: string, expected: string): Promise<number>;
// 返回 1-10 分
```

### 3. 评估运行器

```typescript
async function runEval(
  cases: EvalCase[],
  agent: (input: string) => Promise<AgentResult>,
): Promise<EvalResult[]>;
```

## 使用场景

1. **Prompt 调优** — 改了 prompt 后跑一遍，看分数变化
2. **模型对比** — 同一组用例，不同模型，比较效果
3. **回归测试** — CI/CD 中跑，防止质量退化
4. **安全测试** — 测试 sandbox 的拦截能力

## 与前面章节的关系

- **02-tool-system**：评估工具调用的正确性
- **05-rag**：评估检索质量（context precision/recall）
- **10-sandbox**：评估安全拦截能力
