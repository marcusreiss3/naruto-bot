import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface GuideBlock {
  type: string;
  groupIds?: string[];
  mode?: string;
}

interface Guide {
  slug: string;
  title: string;
  description: string;
  category: string;
  order: number;
  readingTime: number;
  keywords: string[];
  related: string[];
  sections: { id: string; title: string; blocks: GuideBlock[] }[];
}

interface GuideCatalog {
  categories: { id: string; order: number }[];
  learningPath: string[];
  guides: Guide[];
}

function loadCatalog(): GuideCatalog {
  const source = readFileSync(new URL("../public/guides.js", import.meta.url), "utf8");
  const sandbox = { window: {} as { GUIDE_CATALOG?: GuideCatalog } };
  runInNewContext(source, sandbox, { filename: "public/guides.js" });
  if (!sandbox.window.GUIDE_CATALOG) throw new Error("guides.js não expôs GUIDE_CATALOG");
  return sandbox.window.GUIDE_CATALOG;
}

describe("catálogo da Central de Guias", () => {
  const catalog = loadCatalog();
  const slugs = catalog.guides.map((guide) => guide.slug);
  const categoryIds = catalog.categories.map((category) => category.id);

  it("mantém identificadores únicos e todos os vínculos resolvidos", () => {
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(categoryIds).size).toBe(categoryIds.length);
    expect(catalog.guides).toHaveLength(10);

    for (const guide of catalog.guides) {
      expect(categoryIds).toContain(guide.category);
      expect(guide.related.every((slug) => slugs.includes(slug))).toBe(true);
      expect(guide.related).not.toContain(guide.slug);
      expect(guide.sections.length).toBeGreaterThan(0);
      expect(new Set(guide.sections.map((section) => section.id)).size).toBe(guide.sections.length);
    }

    expect(catalog.learningPath.every((slug) => slugs.includes(slug))).toBe(true);
    expect(new Set(catalog.learningPath).size).toBe(catalog.learningPath.length);
  });

  it("fornece metadados pesquisáveis e somente blocos suportados", () => {
    const supportedBlocks = new Set([
      "paragraph",
      "steps",
      "list",
      "callout",
      "commands",
      "equipment",
      "faq",
    ]);
    const runtimeGroups = new Set(["character", "combat", "equipment", "missions", "economy", "village"]);

    for (const guide of catalog.guides) {
      expect(guide.title.trim().length).toBeGreaterThan(0);
      expect(guide.description.trim().length).toBeGreaterThan(0);
      expect(guide.readingTime).toBeGreaterThan(0);
      expect(guide.keywords.length).toBeGreaterThan(2);
      for (const section of guide.sections) {
        expect(section.title.trim().length).toBeGreaterThan(0);
        expect(section.blocks.length).toBeGreaterThan(0);
        for (const block of section.blocks) {
          expect(supportedBlocks.has(block.type)).toBe(true);
          expect((block.groupIds ?? []).every((id) => runtimeGroups.has(id))).toBe(true);
          if (block.type === "equipment") expect(["items", "effects"]).toContain(block.mode);
        }
      }
    }
  });
});
