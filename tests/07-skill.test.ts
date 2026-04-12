/**
 * 07-skill 测试
 *
 * 测试技能加载、frontmatter 解析、prompt 格式化
 * 运行方式：npx vitest run tests/07-skill.test.ts
 */

import { describe, it, expect } from "vitest";
import { resolve } from "path";
import {
  parseFrontmatter,
  loadSkill,
  scanSkills,
  formatSkillsForPrompt,
} from "../src/07-skill/skill";
import { Agent } from "../src/07-skill/agent";

const SKILLS_DIR = resolve(__dirname, "../src/07-skill/skills");

describe("parseFrontmatter", () => {
  it("should parse simple key-value pairs", () => {
    const raw = `---
name: git-commit
description: Generate commit messages
---

Body text here`;
    const [fm, body] = parseFrontmatter(raw);
    expect(fm.name).toBe("git-commit");
    expect(fm.description).toBe("Generate commit messages");
    expect(body.trim()).toBe("Body text here");
  });

  it("should return empty frontmatter for files without ---", () => {
    const raw = "Just plain text\nno frontmatter";
    const [fm, body] = parseFrontmatter(raw);
    expect(Object.keys(fm)).toHaveLength(0);
    expect(body).toBe(raw);
  });

  it("should handle quoted values", () => {
    const raw = `---
name: "my-skill"
description: 'A skill with quotes'
---
body`;
    const [fm] = parseFrontmatter(raw);
    expect(fm.name).toBe("my-skill");
    expect(fm.description).toBe("A skill with quotes");
  });
});

describe("loadSkill", () => {
  it("should load git-commit skill", () => {
    const skill = loadSkill(`${SKILLS_DIR}/git-commit/SKILL.md`);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("git-commit");
    expect(skill!.description).toContain("commit");
    expect(skill!.body).toContain("Conventional Commits");
  });

  it("should load code-review skill", () => {
    const skill = loadSkill(`${SKILLS_DIR}/code-review/SKILL.md`);
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("code-review");
    expect(skill!.description).toContain("审查");
  });

  it("should return null for non-existent file", () => {
    const skill = loadSkill("/tmp/no-such-skill/SKILL.md");
    expect(skill).toBeNull();
  });
});

describe("scanSkills", () => {
  it("should find all skills in the skills directory", () => {
    const skills = scanSkills(SKILLS_DIR);
    const names = skills.map((s) => s.name);
    expect(names).toContain("git-commit");
    expect(names).toContain("code-review");
    expect(skills.length).toBe(2);
  });

  it("should return empty for non-existent directory", () => {
    const skills = scanSkills("/tmp/no-such-dir");
    expect(skills).toEqual([]);
  });
});

describe("formatSkillsForPrompt", () => {
  it("should format skills into prompt index", () => {
    const skills = scanSkills(SKILLS_DIR);
    const prompt = formatSkillsForPrompt(skills);

    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("git-commit:");
    expect(prompt).toContain("code-review:");
    expect(prompt).toContain("skillView(name)");
  });

  it("should return empty for no skills", () => {
    expect(formatSkillsForPrompt([])).toBe("");
  });
});

describe("Agent with skills", () => {
  it("should load skills on construction", () => {
    const agent = new Agent({ skillsDir: SKILLS_DIR });
    const stats = agent.getStats();

    expect(stats.skills).toContain("git-commit");
    expect(stats.skills).toContain("code-review");
    expect(stats.loadedSkills).toEqual([]);
  }, 30000);

  it("should auto-load matching skill on user request", async () => {
    const agent = new Agent({ skillsDir: SKILLS_DIR });

    await agent.send(
      '帮我写一个 git commit message，改动是加了用户登录功能，type 是 feat',
    );

    // Agent 应该调用了 skillView 来加载 git-commit
    expect(agent.getLoadedSkills()).toContain("git-commit");
  }, 60000);
});
