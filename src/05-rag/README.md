# 05 - RAG（检索增强生成）

让 Agent 能查阅外部文档来回答问题。

## 核心流程

```
用户提问
  ↓
embed(query) → query vector
  ↓
余弦相似度检索 → topK chunks
  ↓
拼成 context → 注入 system prompt
  ↓
LLM 基于 context 回答
```

## 模块说明

| 模块 | 职责 |
|------|------|
| `chunker.ts` | 文档切片 — 滑动窗口 + 段落边界优先 |
| `embedder.ts` | Embedding — 调用本地 qwen3-embedding-0.6b |
| `vector-store.ts` | 向量存储 — 内存 Map + JSONL 持久化 + 余弦相似度 |
| `rag.ts` | 核心 — 索引 + 检索 + 格式化 |
| `agent.ts` | Agent — 集成 RAG + searchKnowledge 工具 |

## 运行

```bash
# 交互式对话（带 RAG）
npx tsx src/05-rag/chat.ts

# 启动时直接索引文件
npx tsx src/05-rag/chat.ts ./docs/my-notes.txt
```

## 测试方式

1. 启动对话
2. 输入 `/demo` 加载内置示例文档
3. 问「Octopus Agent 是什么？」或「有哪些章节？」
4. Agent 会先搜索知识库，再基于结果回答

## 和 04-long-term 的对比

| | 04-long-term | 05-rag |
|---|---|---|
| 检索方式 | BM25（关键词匹配） | Embedding（语义相似） |
| 数据来源 | LLM 从对话提取 | 外部文档导入 |
| 存储格式 | JSONL（结构化记忆） | JSONL（文本 + 向量） |
| 场景 | 记住用户偏好 | 回答文档相关问题 |

## 依赖

无新增依赖 — `@ai-sdk/openai` 已支持 embedding，余弦相似度自己手写。

Embedding 模型：本地 qwen3-embedding-0.6b（http://192.168.0.120:8888），维度 1024，上下文 2048 tokens。
