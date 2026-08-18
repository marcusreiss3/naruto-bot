import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

interface GuideBlock {
  type: string;
  groupIds?: string[];
  mode?: string;
  items?: { slug?: string; section?: string }[];
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
  icon: string;
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
    const guidesBySlug = new Map(catalog.guides.map((guide) => [guide.slug, guide]));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(categoryIds).size).toBe(categoryIds.length);
    expect(catalog.guides).toHaveLength(16);
    expect(new Set(catalog.guides.map((guide) => guide.order)).size).toBe(catalog.guides.length);

    for (const guide of catalog.guides) {
      expect(categoryIds).toContain(guide.category);
      expect(guide.related.every((slug) => slugs.includes(slug))).toBe(true);
      expect(guide.related).not.toContain(guide.slug);
      expect(guide.sections.length).toBeGreaterThan(0);
      expect(new Set(guide.sections.map((section) => section.id)).size).toBe(guide.sections.length);
      for (const block of guide.sections.flatMap((section) => section.blocks)) {
        if (block.type !== "links") continue;
        for (const link of block.items ?? []) {
          const target = link.slug ? guidesBySlug.get(link.slug) : undefined;
          expect(target, `link para guia inexistente: ${link.slug}`).toBeDefined();
          if (link.section) {
            expect(
              target?.sections.some((section) => section.id === link.section),
              `seção inexistente: ${link.slug}#${link.section}`,
            ).toBe(true);
          }
        }
      }
    }

    expect(guidesBySlug.get("ranks-ninja")?.category).toBe("progressao");
    expect(guidesBySlug.get("morte-permanente")?.category).toBe("combate");
    expect(guidesBySlug.get("personagem-e-atributos")?.sections.map((section) => section.id))
      .not.toContain("ranks-ninja");

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
      "cards",
      "flow",
      "links",
      "traits",
      "clans",
      "faq",
    ]);
    const runtimeGroups = new Set(["creation", "character", "combat", "equipment", "world", "missions", "resources", "economy", "village"]);

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

  it("publica a experiência de lançamento sem termos internos ou comandos substituídos", () => {
    const text = JSON.stringify(catalog);
    expect(text).not.toMatch(/(?:^|\W)(nó|nós|node|nodes)(?:$|\W)/i);
    expect(text).not.toMatch(/por enquanto|ainda não|estado atual|\bstaff\b/i);

    expect(slugs).toEqual(expect.arrayContaining([
      "primeiros-passos",
      "clas-e-spins",
      "traits",
      "mundo-e-viagem",
      "economia",
    ]));
    expect(text).toContain("/ficha");
    expect(text).toContain("/viajar");
    expect(text).not.toContain("mundo-viagem-e-economia");
    expect(text).not.toMatch(/\b(Konoha|Suna|Kiri|Kumo|Iwa)\b/);
  });

  it("organiza identidade em Começando e separa itens, viagem e economia", () => {
    const bySlug = new Map(catalog.guides.map((guide) => [guide.slug, guide]));
    expect(bySlug.get("primeiros-passos")?.category).toBe("inicio");
    expect(bySlug.get("clas-e-spins")?.category).toBe("inicio");
    expect(bySlug.get("traits")?.category).toBe("inicio");
    expect(bySlug.get("personagem-e-atributos")?.category).toBe("inicio");
    expect(bySlug.get("itens-e-equipamentos")?.category).toBe("mundo");
    expect(bySlug.get("mundo-e-viagem")?.category).toBe("mundo");
    expect(bySlug.get("economia")?.category).toBe("mundo");
    expect(bySlug.get("mundo-e-viagem")?.sections.map((section) => section.id)).not.toContain("lojas");
    expect(bySlug.get("economia")?.sections.map((section) => section.id)).toContain("lojas");
    expect(catalog.learningPath.slice(0, 5)).toEqual([
      "primeiros-passos",
      "clas-e-spins",
      "traits",
      "personagem-e-atributos",
      "arvores-e-jutsus",
    ]);
  });

  it("documenta as regras de lançamento sem termos internos", () => {
    const text = JSON.stringify(catalog);

    expect(text).toContain("Giros");
    expect(text).toContain("Ingots");
    expect(text).toContain("códigos promocionais");
    expect(text).toContain("Boost do servidor");
    expect(text).toContain("primeira afinidade custa 2 pontos");
    expect(text).toContain("Exame Chūnin");
    expect(text).toContain("ANBU");
    expect(text).toContain("morte permanente pode encerrar");
    expect(text).toContain("nível 10");
    expect(text).toContain("Iniciativa");
    expect(text).toContain("Sustenta o controle de marionetes");
    expect(text).toContain("energia natural");

    expect(text).not.toContain("não possui árvores ou efeitos mecânicos");
    expect(text).not.toContain("Sem progressão pública automática");
    expect(text).not.toContain("Nem toda arma equipada ataca");
    expect(text).not.toContain("Kazekage e Shirogane existem");
  });

  it("usa ícones próprios em todos os guias e categorias", () => {
    const iconIds = [
      ...catalog.categories.map((category) => (category as { icon?: string }).icon),
      ...catalog.guides.map((guide) => guide.icon),
    ];
    const sprite = readFileSync(new URL("../public/assets/guides/guide-icons.svg", import.meta.url), "utf8");
    const spriteIds = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]));

    expect(iconIds).toHaveLength(22);
    expect(new Set(iconIds).size).toBe(iconIds.length);
    expect(iconIds.every((icon) => typeof icon === "string" && spriteIds.has(icon))).toBe(true);
    expect(iconIds.every((icon) => /^[a-z0-9-]+$/.test(icon!))).toBe(true);
  });
});
