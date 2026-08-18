import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import Fastify from "fastify";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { GATHER_AREAS } from "../src/data/gathering.js";
import { ITEMS } from "../src/data/items.js";
import { VILLAGE_NAMES } from "../src/data/villages.js";
import { registerApi } from "../src/server/api.js";
import {
  GUIDE_CATALOG_SCHEMA_VERSION,
  buildGuideCatalog,
} from "../src/services/characters/equipment-catalog.js";

describe("catálogo vivo da Central de Guias", () => {
  const catalog = buildGuideCatalog();

  it("expõe o contrato completo em rota pública e independente da ficha", async () => {
    const app = Fastify();
    registerApi(app);

    const response = await app.inject({ method: "GET", url: "/api/guides/catalog" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = response.json<ReturnType<typeof buildGuideCatalog>>();
    expect(body.schemaVersion).toBe(GUIDE_CATALOG_SCHEMA_VERSION);
    expect(body.traits).toHaveLength(26);
    expect(body.clanGroups.flatMap((group) => group.clans)).toHaveLength(25);
    expect(body.items).toHaveLength(ITEMS.length);
  });

  it("mantém servidor, cliente e cache-buster na mesma versão", () => {
    const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
    const htmlSource = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
    const clientVersion = Number(appSource.match(/catalog\?\.schemaVersion === (\d+)/)?.[1]);

    // Todo .js/.css servido pelo proprio site precisa carregar o cache-buster,
    // senao o navegador guarda a versao velha e o catalogo novo nunca chega.
    // A lista sai do HTML em vez de ser um numero fixo: a versao anterior deste
    // teste travava a contagem em 4 e ficou vermelha assim que um quinto script
    // entrou no index.html — falhava por desatualizacao, nao por regressao.
    const localAssets = [...htmlSource.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css)[^"]*)"/g)]
      .map((match) => match[1]!);
    const semBuster = localAssets.filter((asset) => !/\?v=guide-catalog-\d+/.test(asset));
    const cacheVersions = localAssets
      .map((asset) => Number(asset.match(/guide-catalog-(\d+)/)?.[1]))
      .filter((version) => Number.isFinite(version));

    expect(clientVersion).toBe(GUIDE_CATALOG_SCHEMA_VERSION);
    expect(semBuster).toEqual([]);
    expect(cacheVersions.length).toBeGreaterThan(0);
    expect(new Set(cacheVersions)).toEqual(new Set([GUIDE_CATALOG_SCHEMA_VERSION]));
  });

  it("preserva todas as associações de Clã por Vila com nomes oficiais", () => {
    expect(VILLAGE_NAMES).toEqual({
      KONOHA: "Konohagakure",
      SUNA: "Sunagakure",
      IWA: "Iwagakure",
      KUMO: "Kumogakure",
      KIRI: "Kirigakure",
    });
    expect(catalog.clanGroups.map((group) => group.name)).toEqual([
      "Konohagakure",
      "Sunagakure",
      "Kirigakure",
      "Kumogakure",
      "Iwagakure",
    ]);

    const clans = catalog.clanGroups.flatMap((group) =>
      group.clans.map((clan) => ({ ...clan, expectedVillage: group.id })),
    );
    expect(new Set(clans.map((clan) => clan.id).values()).size).toBe(25);
    expect(clans.every((clan) => clan.villageId === clan.expectedVillage)).toBe(true);
    expect(clans.every((clan) => clan.villageName.endsWith("gakure"))).toBe(true);
  });

  it("reutiliza todos os itens e somente áreas reais de coleta", () => {
    expect(catalog.items.map((item) => item.id)).toEqual(ITEMS.map((item) => item.id));
    const areaNames = new Set(GATHER_AREAS.map((area) => area.name));
    expect(catalog.items.flatMap((item) => item.gatheringSources)
      .every((source) => areaNames.has(source.area))).toBe(true);
    expect(catalog.items.every((item) => !("village" in item) && !("villageId" in item))).toBe(true);
  });

  it("carrega e decodifica os 51 ícones oficiais de Traits e Clãs", async () => {
    const iconUrls = [
      ...catalog.traits.map((trait) => trait.icon),
      ...catalog.clanGroups.flatMap((group) => group.clans.map((clan) => clan.icon)),
    ];
    expect(iconUrls).toHaveLength(51);
    expect(new Set(iconUrls).size).toBe(51);

    for (const iconUrl of iconUrls) {
      const path = fileURLToPath(new URL(`../public${iconUrl}`, import.meta.url));
      expect(existsSync(path), iconUrl).toBe(true);
      const metadata = await sharp(path).metadata();
      expect(metadata.width, iconUrl).toBeGreaterThan(0);
      expect(metadata.height, iconUrl).toBeGreaterThan(0);
    }
  });

  it("mantém filtros e abertura individual no renderer", () => {
    const source = readFileSync(new URL("../public/guides-ui.js", import.meta.url), "utf8");
    expect(source).toContain('<details class="trait-card"');
    expect(source).toContain('<details class="clan-card"');
    expect(source).toContain('<details class="equipment-card item-card"');
    expect(source).toContain('data-entry-id="${escapeHtml(trait.id)}"');
    expect(source).toContain('data-entry-id="${escapeHtml(clan.id)}"');
    expect(source).toContain('data-filter-value="${escapeHtml(clan.villageId)}"');
    expect(source).toContain('data-compendium="items"');
    expect(source).not.toContain("if (!traits.length) return commandsMarkup");
    expect(source).not.toContain("if (!clans.length) return commandsMarkup");

    const sandbox = { window: {} as {
      GuideCenter?: {
        matchesCompendiumEntry: (filterValue: string, searchValue: string, filter: string, term: string) => boolean;
      };
    } };
    runInNewContext(source, sandbox, { filename: "public/guides-ui.js" });
    const matches = sandbox.window.GuideCenter?.matchesCompendiumEntry;
    expect(matches).toBeTypeOf("function");
    expect(matches?.("KONOHA", "Uchiha Konohagakure Sharingan", "KONOHA", "uchíha")).toBe(true);
    expect(matches?.("KONOHA", "Uchiha Konohagakure Sharingan", "KIRI", "")).toBe(false);
    expect(matches?.("MATERIAL", "Madeira Floresta Campo Aberto", "MATERIAL", "floresta")).toBe(true);
  });

  it("renderiza banner e sprite animado sem usar emojis como identidade dos guias", () => {
    const source = readFileSync(new URL("../public/guides-ui.js", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../public/style.css", import.meta.url), "utf8");

    expect(source).toContain("Naruto <span>RP</span>");
    expect(source).toContain("/assets/guides/guide-icons.svg?v=2");
    expect(source).toContain('class="guide-card-icon">${guideIcon(guide.icon)}');
    expect(source).toContain("category-tab-icon");
    expect(source).toContain("sidebar-category-icon");
    expect(styles).toContain("@keyframes guide-icon-breathe");
    expect(styles).toContain("@keyframes guide-icon-float");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("renderiza todos os cards pelos IDs canônicos, sem fallback de referência", () => {
    const root = {
      innerHTML: "",
      querySelectorAll: () => [],
      querySelector: () => null,
    };
    const classList = { add() {}, remove() {}, toggle() {} };
    const scrollContainer = {
      scrollTop: 0,
      scrollHeight: 100,
      clientHeight: 100,
      addEventListener() {},
      removeEventListener() {},
    };
    const sandbox = {
      window: {} as {
        GUIDE_CATALOG?: unknown;
        GuideCenter?: {
          create: (options: unknown) => { showGuide: (slug: string) => boolean };
        };
      },
      document: { title: "" },
      requestAnimationFrame: (callback: () => void) => callback(),
      localStorage: { getItem: () => null, setItem() {} },
      matchMedia: () => ({ matches: true }),
    };
    runInNewContext(readFileSync(new URL("../public/guides.js", import.meta.url), "utf8"), sandbox);
    runInNewContext(readFileSync(new URL("../public/guides-ui.js", import.meta.url), "utf8"), sandbox);
    const center = sandbox.window.GuideCenter!.create({
      root,
      scrollContainer,
      progress: { classList },
      progressBar: { style: {} },
      catalog: sandbox.window.GUIDE_CATALOG,
      runtime: catalog,
    });

    center.showGuide("traits");
    const traitIds = [...root.innerHTML.matchAll(/id="trait-([^"]+)"/g)].map((match) => match[1]);
    expect(traitIds).toEqual(catalog.traits.map((trait) => trait.id));
    expect(root.innerHTML).not.toContain("Referência indisponível");

    center.showGuide("clas-e-spins");
    const clanIds = [...root.innerHTML.matchAll(/id="clan-([^"]+)"/g)].map((match) => match[1]);
    expect(clanIds).toEqual(catalog.clanGroups.flatMap((group) => group.clans.map((clan) => clan.id)));
    expect(root.innerHTML).not.toContain("Referência indisponível");

    center.showGuide("itens-e-equipamentos");
    const itemIds = [...root.innerHTML.matchAll(/id="item-([^"]+)"/g)].map((match) => match[1]);
    expect(itemIds).toHaveLength(catalog.items.length);
    expect(new Set(itemIds)).toEqual(new Set(catalog.items.map((item) => item.id)));
  });
});
