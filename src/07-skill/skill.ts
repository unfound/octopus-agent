/**
 * 技能加载器
 *
 * 核心概念（参考 Hermes 的做法）：
 * 1. 扫描 skills/ 目录下的 SKILL.md 文件
 * 2. 解析 YAML frontmatter（name, description）
 * 3. 格式化为 system prompt 中的技能索引
 * 4. Agent 自己判断哪个 skill 匹配，通过 skillView tool 加载完整内容
 *
 * SKILL.md 格式：
 * ```
 * ---
 * name: git-commit
 * description: 生成规范的 commit message
 * ---
 * # 正文指令...
 * ```
 */

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join } from "path";

/** 技能元数据 */
export interface Skill {
  /** 技能名称（来自 frontmatter，或目录名） */
  name: string;
  /** 技能描述 */
  description: string;
  /** SKILL.md 文件路径 */
  filePath: string;
  /** 技能目录（SKILL.md 的父目录） */
  baseDir: string;
  /** frontmatter 之后的正文内容 */
  body: string;
}

/**
 * 解析 YAML frontmatter
 *
 * 只处理简单的 key: value 格式，不依赖完整的 YAML 库
 */
export function parseFrontmatter(
  raw: string,
): [Record<string, string>, string] {
  const lines = raw.split("\n");

  // 找到 --- 分隔符
  if (lines[0]?.trim() !== "---") {
    return [{}, raw];
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return [{}, raw];
  }

  const fmLines = lines.slice(1, endIdx);
  const body = lines.slice(endIdx + 1).join("\n");
  const frontmatter: Record<string, string> = {};

  for (const line of fmLines) {
    const match = line.match(/^(\w[\w-]*):\s*(.+)/);
    if (match) {
      frontmatter[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }

  return [frontmatter, body];
}

/**
 * 从单个 SKILL.md 文件加载技能
 */
export function loadSkill(filePath: string): Skill | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const [fm, body] = parseFrontmatter(raw);

    const name = fm.name || filePath.split("/").at(-2) || "unknown";
    const description =
      fm.description ||
      // 没有 description 时，取正文第一行非空非标题行
      body
        .split("\n")
        .find((l) => l.trim() && !l.startsWith("#"))
        ?.slice(0, 80) ||
      `Skill: ${name}`;

    return {
      name,
      description,
      filePath,
      baseDir: filePath.replace(/\/SKILL\.md$/, ""),
      body,
    };
  } catch {
    return null;
  }
}

/**
 * 扫描目录，加载所有技能
 *
 * 发现规则：
 * - 如果目录包含 SKILL.md，把它当作一个技能
 * - 否则递归进子目录查找
 */
export function scanSkills(baseDir: string): Skill[] {
  const skills: Skill[] = [];
  if (!existsSync(baseDir)) return skills;

  const seen = new Set<string>();

  function walk(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });

    // 先看当前目录有没有 SKILL.md
    for (const entry of entries) {
      if (entry.isFile() && entry.name === "SKILL.md") {
        const skill = loadSkill(join(dir, entry.name));
        if (skill && !seen.has(skill.name)) {
          seen.add(skill.name);
          skills.push(skill);
        }
        return; // 找到 SKILL.md 就不递归了
      }
    }

    // 没有 SKILL.md，递归子目录
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        walk(join(dir, entry.name));
      }
    }
  }

  walk(baseDir);
  return skills;
}

/**
 * 把技能列表格式化为 system prompt 片段
 *
 * 参考 Hermes 的格式：分类缩进列表
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";

  const lines = [
    "## Skills（可选技能）",
    "以下技能可以在需要时加载。如果你的任务明显匹配某个技能的描述，",
    '用 skillView(name) 加载它的完整指令并遵循。',
    "没有匹配的技能就正常回复，不要强行使用。",
    "",
    "<available_skills>",
  ];

  for (const skill of skills.sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`  - ${skill.name}: ${skill.description}`);
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}
