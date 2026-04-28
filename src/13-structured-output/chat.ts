/**
 * 13-structured-output 交互入口
 *
 * 演示结构化输出的各种模式：
 * 1. 代码审查     — generateObject + 复杂嵌套 Schema
 * 2. 信息提取     — 自然语言 → 结构化数据
 * 3. 意图分类     — 小模型分类器
 * 4. 实体提取     — NER with LLM
 * 5. 流式审查     — streamObject 逐步构建
 *
 * 运行方式：
 *   npx tsx src/13-structured-output/chat.ts review    # 代码审查
 *   npx tsx src/13-structured-output/chat.ts extract   # 信息提取
 *   npx tsx src/13-structured-output/chat.ts classify  # 意图分类
 *   npx tsx src/13-structured-output/chat.ts entities  # 实体提取
 *   npx tsx src/13-structured-output/chat.ts stream    # 流式审查
 */

import {
  reviewCode,
  extractEmail,
  classifyIntent,
  extractEntities,
  reviewCodeStream,
} from "./generate";

// ====== 演示数据 ======

const SAMPLE_CODE = `
function process(data: any) {
  for (var i = 0; i < data.length; i++) {
    var item = data[i];
    if (item.type == "admin") {
      console.log("admin user: " + item.name)
      var password = item.password;
      return password;
    }
  }
  return null
}
`;

const SAMPLE_EMAIL = `
发件人: 张三
主题: 关于下周一的代码评审会议

王经理您好，

下周一的代码评审会议我已经准备好了材料。
但是项目二的接口文档还没更新，可能需要您协调一下小刘那边。
另外周五之前需要完成用户模块的重构，时间比较紧。

如果方便的话，请在下周三之前回复确认。

此致
`;

const SAMPLE_MESSAGES = [
  "你好，请问这个怎么用？",
  "把 /tmp 下面的临时文件全部删掉！",
  "这个功能太难用了，每次都要点三次才能找到入口，气死了",
  "我建议登录页可以加一个记住密码的功能",
  "早上好！",
];

const SAMPLE_TEXT = `
2024 年 3 月，阿里巴巴宣布与 OpenAI 达成合作，将在杭州设立联合实验室。
CEO 张勇表示："我们将使用 Python 和 Rust 重写核心服务，部署在 AWS 上。"
这项合作预计在 2025 年第二季度完成。
`;

// ====== 演示函数 ======

async function demoReview() {
  console.log("\n📦 Demo 1: 代码审查 — generateObject\n");
  console.log("审查代码:");
  console.log("```");
  console.log(SAMPLE_CODE.trim());
  console.log("```\n");

  const result = await reviewCode(SAMPLE_CODE);

  console.log(`📊 评分: ${result.score}/10`);
  console.log(`📝 总结: ${result.summary}`);
  console.log(`💪 优点: ${result.strengths.join(", ")}`);
  console.log(`\n🔍 问题 (${result.issues.length}):`);
  for (const issue of result.issues) {
    const icon = issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
    console.log(`  ${icon} L${issue.line} [${issue.category}] ${issue.message}`);
    if (issue.suggestion) {
      console.log(`     💡 ${issue.suggestion}`);
    }
  }
}

async function demoExtract() {
  console.log("\n📦 Demo 2: 信息提取 — generateObject\n");
  console.log("原始文本:");
  console.log(SAMPLE_EMAIL.trim());
  console.log();

  const result = await extractEmail(SAMPLE_EMAIL);

  console.log("结构化提取:");
  console.log(JSON.stringify(result, null, 2));
}

async function demoClassify() {
  console.log("\n📦 Demo 3: 意图分类 — generateObject\n");

  for (const msg of SAMPLE_MESSAGES) {
    const result = await classifyIntent(msg);

    const intentIcon = {
      question: "❓",
      command: "⚡",
      complaint: "😤",
      feedback: "💡",
      greeting: "👋",
      other: "❔",
    }[result.intent];

    const sentimentIcon = {
      positive: "😊",
      neutral: "😐",
      negative: "😞",
    }[result.sentiment];

    console.log(`${intentIcon} "${msg}"`);
    console.log(`   意图: ${result.intent} (${Math.round(result.confidence * 100)}%) | 情感: ${sentimentIcon} ${result.sentiment} | 话题: ${result.topics.join(", ")}`);
    console.log();
  }
}

async function demoEntities() {
  console.log("\n📦 Demo 4: 实体提取 — generateObject\n");
  console.log("原始文本:");
  console.log(SAMPLE_TEXT.trim());
  console.log();

  const result = await extractEntities(SAMPLE_TEXT);

  console.log(JSON.stringify(result, null, 2));
}

async function demoStream() {
  console.log("\n📦 Demo 5: 流式代码审查 — streamObject\n");
  console.log("审查代码（流式构建中...):\n");

  let lastUpdate = Date.now();
  let partialCount = 0;

  const result = await reviewCodeStream(SAMPLE_CODE, (partial) => {
    partialCount++;
    // 每 200ms 更新一次显示（避免刷屏）
    if (Date.now() - lastUpdate > 200) {
      const status = [
        partial.summary ? "✅ summary" : "⏳ summary",
        partial.issues ? `✅ issues(${partial.issues.length})` : "⏳ issues",
        partial.score ? "✅ score" : "⏳ score",
      ].join(" | ");
      process.stdout.write(`\r  构建中... [${status}]`);
      lastUpdate = Date.now();
    }
  });

  process.stdout.write("\r" + " ".repeat(80) + "\r"); // 清除行

  console.log(`📊 评分: ${result.score}/10`);
  console.log(`📝 总结: ${result.summary}`);
  console.log(`🔍 问题数: ${result.issues.length}`);
  console.log(`📈 流式更新次数: ${partialCount}`);
  console.log(`\n💡 提示: streamObject 让用户实时看到结构化对象逐步成型`);
}

// ====== 入口 ======

async function main() {
  const mode = process.argv[2] || "review";

  switch (mode) {
    case "review":
      await demoReview();
      break;
    case "extract":
      await demoExtract();
      break;
    case "classify":
      await demoClassify();
      break;
    case "entities":
      await demoEntities();
      break;
    case "stream":
      await demoStream();
      break;
    default:
      console.log("用法: npx tsx src/13-structured-output/chat.ts [review|extract|classify|entities|stream]");
  }
}

main().catch(console.error);
