"use strict";

// Renderer da Central de Guias. O conteúdo editorial mora em guides.js e os
// dados que mudam com o jogo (comandos, Traits, Clãs, itens e efeitos) vêm do
// catálogo compartilhado da API.
(function exposeGuideCenter() {
  const PROGRESS_KEY = "arquivo-shinobi:guias-concluidos:v1";
  const CATEGORY_LABELS = {
    NINJUTSU: "Ninjutsu",
    TAIJUTSU: "Taijutsu",
    KENJUTSU: "Kenjutsu",
    BUKIJUTSU: "Bukijutsu",
    IRYO_NINJUTSU: "Iryō Ninjutsu",
    GENJUTSU: "Genjutsu",
    DOJUTSU: "Dōjutsu",
  };
  const ACTION_LABELS = { COMUM: "Ação comum", BONUS: "Ação bônus", MOVIMENTO: "Movimento", REACAO: "Reação" };
  const RESOURCE_LABELS = { chakra: "Chakra", energia: "Energia" };
  const GUIDE_ICON_SPRITE = "/assets/guides/guide-icons.svg?v=1";
  // app.js roda depois deste script (ordem em index.html), mas so' chamamos
  // isso na hora de renderizar a pagina, ja' com os dois scripts carregados.
  const assetUrl = (path) => (window.assetUrl ? window.assetUrl(path) : path);

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const inline = (value) => escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  function guideIcon(icon, className = "guide-icon") {
    const safeIcon = /^[a-z0-9-]+$/i.test(String(icon || "")) ? icon : "cat-reference";
    return `<svg class="${escapeHtml(className)} icon-${escapeHtml(safeIcon)}" aria-hidden="true" viewBox="0 0 48 48"><use href="${GUIDE_ICON_SPRITE}#${escapeHtml(safeIcon)}"></use></svg>`;
  }

  const normalize = (value) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  function matchesCompendiumEntry(filterValue, searchValue, filter, term) {
    const matchesFilter = filter === "all" || filterValue === filter;
    const matchesSearch = !term || normalize(searchValue).includes(normalize(term));
    return matchesFilter && matchesSearch;
  }

  function collectText(value, output = []) {
    if (typeof value === "string" || typeof value === "number") output.push(String(value));
    else if (Array.isArray(value)) value.forEach((entry) => collectText(entry, output));
    else if (value && typeof value === "object") Object.values(value).forEach((entry) => collectText(entry, output));
    return output;
  }

  function loadCompleted() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "[]");
      return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
    } catch {
      return new Set();
    }
  }

  function saveCompleted(completed) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify([...completed]));
    } catch {
      // A Central continua funcional quando armazenamento local está bloqueado.
    }
  }

  function escapedSelector(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  function createGuideCenter({ root, scrollContainer, progress, progressBar, catalog, runtime }) {
    if (!root || !scrollContainer || !catalog) throw new Error("Central de Guias sem elementos obrigatórios.");

    const categories = [...catalog.categories].sort((a, b) => a.order - b.order);
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const guides = [...catalog.guides].sort((a, b) => a.order - b.order);
    const guideBySlug = new Map(guides.map((guide) => [guide.slug, guide]));
    const completed = loadCompleted();
    let runtimeCatalog = runtime;
    let activeCategory = "all";
    let searchTerm = "";
    let activeSlug = null;
    let sectionObserver = null;

    function categoryOf(guide) {
      return categoryById.get(guide.category) || { id: guide.category, title: guide.category, icon: "cat-reference" };
    }

    function readingLabel(guide) {
      const minutes = Number(guide.readingTime) || 1;
      return `${minutes} min de leitura`;
    }

    function guideHref(slug, section) {
      const base = `#/guias/${encodeURIComponent(slug)}`;
      return section ? `${base}/${encodeURIComponent(section)}` : base;
    }

    function completedBadge(slug) {
      return completed.has(slug) ? '<span class="guide-complete-badge">✓ Concluído</span>' : "";
    }

    function guideCard(guide, compact = false) {
      const category = categoryOf(guide);
      return `<a class="guide-card${compact ? " compact" : ""}${completed.has(guide.slug) ? " is-complete" : ""}" href="${guideHref(guide.slug)}">
        <span class="guide-card-icon">${guideIcon(guide.icon)}</span>
        <span class="guide-card-body">
          <span class="guide-card-meta"><span>${escapeHtml(category.title)}</span><span>•</span><span>${escapeHtml(readingLabel(guide))}</span></span>
          <strong>${escapeHtml(guide.title)}</strong>
          ${compact ? "" : `<span class="guide-card-description">${escapeHtml(guide.description)}</span>`}
          ${completedBadge(guide.slug)}
        </span>
        <span class="guide-card-arrow" aria-hidden="true">→</span>
      </a>`;
    }

    function learningStep(slug, index) {
      const guide = guideBySlug.get(slug);
      if (!guide) return "";
      return `<a class="learning-step${completed.has(slug) ? " is-complete" : ""}" href="${guideHref(slug)}">
        <span class="learning-step-number">${completed.has(slug) ? "✓" : index + 1}</span>
        <span class="learning-step-icon">${guideIcon(guide.icon)}</span>
        <span><strong>${escapeHtml(guide.title)}</strong><small>${escapeHtml(guide.description)}</small></span>
        <span class="learning-step-arrow" aria-hidden="true">→</span>
      </a>`;
    }

    function guideSearchText(guide) {
      const category = categoryOf(guide);
      const runtimeParts = [];
      for (const section of guide.sections || []) {
        for (const block of section.blocks || []) {
          if (block.type === "commands") {
            const groups = runtimeCatalog?.commandGroups || [];
            const selected = block.all ? groups : groups.filter((group) => (block.groupIds || []).includes(group.id));
            collectText(selected, runtimeParts);
          } else if (block.type === "equipment" && block.mode === "effects") {
            collectText(runtimeCatalog?.effectGroups || [], runtimeParts);
          } else if (block.type === "equipment") {
            collectText([runtimeCatalog?.categories || [], runtimeCatalog?.items || []], runtimeParts);
          } else if (block.type === "traits") {
            collectText(runtimeCatalog?.traits || [], runtimeParts);
          } else if (block.type === "clans") {
            collectText(runtimeCatalog?.clanGroups || [], runtimeParts);
          }
        }
      }
      return normalize([
        guide.title,
        guide.description,
        category.title,
        ...(guide.keywords || []),
        ...collectText(guide.sections || []),
        ...runtimeParts,
      ].join(" "));
    }

    function homeMarkup() {
      const completeCount = guides.filter((guide) => completed.has(guide.slug)).length;
      return `<div class="guides-shell guides-home">
        <header class="guides-hero">
          <div class="guides-hero-copy">
            <div class="guides-brand-lockup" aria-label="Naruto RP — Central de Guias">
              <span class="guides-brand-kicker">Arquivo Shinobi</span>
              <h1 tabindex="-1">Naruto <span>RP</span></h1>
              <strong>Central de Guias</strong>
            </div>
            <p>Encontre o próximo passo, entenda as regras e consulte comandos sem sair do seu pergaminho.</p>
            <div class="guides-summary" aria-label="Resumo da Central">
              <span><b>${guides.length}</b> guias</span>
              <span><b>${categories.length}</b> categorias</span>
              <span><b>${completeCount}</b> concluídos</span>
            </div>
          </div>
          <div class="guides-hero-emblem" aria-hidden="true">
            <span class="hero-orbit orbit-one"></span><span class="hero-orbit orbit-two"></span>
            ${guideIcon("guide-skills", "guide-icon hero-emblem-icon")}
          </div>
          <form class="guide-search-form" role="search" id="guideSearchForm">
            <label class="sr-only" for="guideSearch">Pesquisar nos guias</label>
            <div class="guide-search">
              <svg class="search-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.3-4.3m2.3-5.2A7.5 7.5 0 1 1 4 11.5a7.5 7.5 0 0 1 15 0Z"/></svg>
              <input id="guideSearch" type="search" placeholder="Pesquisar nos guias..." autocomplete="off" value="${escapeHtml(searchTerm)}">
              <button class="search-clear${searchTerm ? "" : " hidden"}" id="guideSearchClear" type="button" aria-label="Limpar pesquisa">×</button>
            </div>
            <p class="guide-search-status" id="guideSearchStatus" role="status" aria-live="polite"></p>
          </form>
        </header>

        <nav class="category-tabs" aria-label="Categorias de guias" id="guideCategories">
          <button class="category-tab${activeCategory === "all" ? " active" : ""}" type="button" data-category="all" aria-pressed="${activeCategory === "all"}">Todos</button>
          ${categories.map((category) => `<button class="category-tab${activeCategory === category.id ? " active" : ""}" type="button" data-category="${escapeHtml(category.id)}" aria-pressed="${activeCategory === category.id}"><span class="category-tab-icon">${guideIcon(category.icon)}</span>${escapeHtml(category.title)}</button>`).join("")}
        </nav>

        <section class="start-section" aria-labelledby="startTitle">
          <div class="section-heading">
            <div><span class="guides-eyebrow">Trilha recomendada</span><h2 id="startTitle">Comece por aqui</h2></div>
            <p>Uma sequência curta para sair do zero e chegar ao primeiro combate.</p>
          </div>
          <div class="learning-path">${catalog.learningPath.map(learningStep).join("")}</div>
        </section>

        <section class="guide-library" aria-labelledby="libraryTitle">
          <div class="section-heading">
            <div><span class="guides-eyebrow">Explore por assunto</span><h2 id="libraryTitle">Todos os guias</h2></div>
          </div>
          <div class="guide-grid" id="guideResults"></div>
          <div class="empty-results hidden" id="guideEmpty">
            <span aria-hidden="true">⌕</span>
            <h3>Nenhum guia encontrado</h3>
            <p id="guideEmptyText">Tente usar outro termo ou explore todas as categorias.</p>
            <button class="btn-secondary" id="guideReset" type="button">Limpar filtros</button>
          </div>
        </section>
      </div>`;
    }

    function filteredGuides() {
      const tokens = normalize(searchTerm.trim()).split(/\s+/).filter(Boolean);
      const matches = guides.filter((guide) => {
        const inCategory = activeCategory === "all" || guide.category === activeCategory;
        const searchable = guideSearchText(guide);
        return inCategory && tokens.every((token) => searchable.includes(token));
      });
      if (!tokens.length) return matches;
      return matches.sort((first, second) => {
        const score = (guide) => {
          const title = normalize(guide.title);
          const description = normalize(guide.description);
          const keywords = normalize((guide.keywords || []).join(" "));
          return tokens.reduce((total, token) => total
            + (title.startsWith(token) ? 12 : title.includes(token) ? 8 : 0)
            + (keywords.includes(token) ? 5 : 0)
            + (description.includes(token) ? 3 : 0), 0);
        };
        return score(second) - score(first) || first.order - second.order;
      });
    }

    function updateHomeResults({ focusSearch = false } = {}) {
      const results = root.querySelector("#guideResults");
      const status = root.querySelector("#guideSearchStatus");
      const empty = root.querySelector("#guideEmpty");
      const emptyText = root.querySelector("#guideEmptyText");
      const clear = root.querySelector("#guideSearchClear");
      if (!results || !status || !empty) return;

      const visible = filteredGuides();
      results.innerHTML = visible.map((guide) => guideCard(guide)).join("");
      results.classList.toggle("hidden", visible.length === 0);
      empty.classList.toggle("hidden", visible.length !== 0);
      clear?.classList.toggle("hidden", !searchTerm);

      const countLabel = `${visible.length} ${visible.length === 1 ? "guia encontrado" : "guias encontrados"}`;
      status.textContent = searchTerm || activeCategory !== "all" ? countLabel : `${guides.length} guias disponíveis`;
      if (emptyText) {
        emptyText.textContent = searchTerm
          ? `Não encontramos conteúdo para “${searchTerm}”. Tente um termo mais curto ou limpe a pesquisa.`
          : "Não há guias nesta categoria. Explore todas as categorias.";
      }

      root.querySelectorAll(".category-tab").forEach((button) => {
        const active = button.dataset.category === activeCategory;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });

      if (focusSearch) root.querySelector("#guideSearch")?.focus();
    }

    function bindHome() {
      const form = root.querySelector("#guideSearchForm");
      const input = root.querySelector("#guideSearch");
      form?.addEventListener("submit", (event) => event.preventDefault());
      input?.addEventListener("input", (event) => {
        searchTerm = event.target.value;
        updateHomeResults();
      });
      root.querySelector("#guideSearchClear")?.addEventListener("click", () => {
        searchTerm = "";
        if (input) input.value = "";
        updateHomeResults({ focusSearch: true });
      });
      root.querySelector("#guideReset")?.addEventListener("click", () => {
        searchTerm = "";
        activeCategory = "all";
        if (input) input.value = "";
        updateHomeResults({ focusSearch: true });
      });
      root.querySelector("#guideCategories")?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category]");
        if (!button) return;
        activeCategory = button.dataset.category;
        updateHomeResults();
      });
    }

    function showHome() {
      activeSlug = null;
      disconnectArticleObservers();
      scrollContainer.scrollTop = 0;
      progress?.classList.add("hidden");
      root.innerHTML = homeMarkup();
      bindHome();
      updateHomeResults();
      document.title = "Guias — Arquivo Shinobi";
      requestAnimationFrame(() => root.querySelector("h1")?.focus({ preventScroll: true }));
    }

    function abilityArea(ability) {
      const range = Number(ability.range) || 0;
      const labels = {
        MELEE: "Corpo a corpo",
        SELF: "Em si mesmo",
        ALLY: `Aliado · ${range} casas`,
        SINGLE_TARGET: `Alvo · ${range} casas`,
        LINE: `Linha · ${range} casas`,
        CONE: `Cone · ${range} casas`,
        RADIUS: `Área · raio ${range} casas`,
        GLOBAL_OR_SCENARIO: "Campo inteiro",
      };
      return labels[ability.shape] || (range ? `${range} casas` : null);
    }

    function abilityMarkup(ability, command) {
      if (!ability) return "";
      const action = ACTION_LABELS[ability.actionType] || ability.actionType;
      const additionalAction = ability.additionalActionType
        ? ACTION_LABELS[ability.additionalActionType] || ability.additionalActionType
        : null;
      const stats = [
        CATEGORY_LABELS[ability.category] || ability.category,
        additionalAction ? `${action} + ${additionalAction}` : action,
        abilityArea(ability),
        ability.resource ? `${RESOURCE_LABELS[ability.resource] || ability.resource}: ${ability.cost}%` : null,
        ability.baseDamage ? `Dano base: ${ability.baseDamage}` : null,
      ].filter(Boolean);
      return `<div class="equipment-ability">
        <div class="equipment-ability-head">${command ? `<code>${escapeHtml(command)}</code>` : ""}<strong>${escapeHtml(ability.name)}</strong></div>
        <div class="equipment-stats">${stats.map((stat) => `<span>${escapeHtml(stat)}</span>`).join("")}</div>
        <p>${escapeHtml(ability.mechanics || ability.description || "")}</p>
      </div>`;
    }

    function commandsMarkup(block) {
      const groups = runtimeCatalog?.commandGroups || [];
      const selected = block.all
        ? groups
        : groups.filter((group) => (block.groupIds || []).includes(group.id));
      if (!selected.length) return catalogContractError("comandos");
      return `<div class="guide-command-groups">${selected.map((group) => `<section class="command-group">
        <h3><span aria-hidden="true">${escapeHtml(group.icon)}</span>${escapeHtml(group.title)}</h3>
        <div class="command-grid">${group.commands.map((entry) => `<article class="command-card"><code>${escapeHtml(entry.command)}</code><p>${escapeHtml(entry.description)}</p></article>`).join("")}</div>
      </section>`).join("")}</div>`;
    }

    function catalogContractError(subject) {
      throw new Error(`Contrato incompleto do catálogo de ${subject}.`);
    }

    function itemInfoBlock(title, values) {
      if (!values?.length) return "";
      return `<section class="item-info-block"><strong>${escapeHtml(title)}</strong><ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul></section>`;
    }

    function itemDetailMarkup(item) {
      const gathering = (item.gatheringSources || []).map((source) =>
        `${source.area} · ${(source.actions || []).join(" / ")}${source.rareChancePercent ? ` · ${source.rareChancePercent}% de chance` : ""}`,
      );
      const production = (item.recipeSources || []).map((source) =>
        `${source.name} · ${source.source}${source.outputQty > 1 ? ` · produz ${source.outputQty}` : ""}`,
      );
      const facts = [
        item.rare ? "Material raro" : null,
        item.stackable ? "Empilhável" : "Não empilhável",
        item.satiety ? `Recupera ${item.satiety} de saciedade` : null,
      ].filter(Boolean);
      const restoration = item.restoration
        ? [`Restaura para ${item.restoration.itemName}${item.restoration.cost ? ` por ${item.restoration.cost} Ryō` : ""}`]
        : [];
      const transformations = (item.transformedFrom || []).map((source) =>
        `${source.fromItem} após usar ${source.ability}`,
      );
      const villageProduction = (item.villageSectorSources || []).map((source) =>
        `${source.sector} · ${source.destination}`,
      );
      const isEquippable = (item.actions || []).some((action) => action.id === "EQUIP");
      const basicCommand = isEquippable ? "/atacar alvo" : `/usar ${item.id}`;

      return `<div class="item-card-details">
        <p class="equipment-description">${escapeHtml(item.description)}</p>
        ${item.specialRule ? `<p class="equipment-special">${escapeHtml(item.specialRule)}</p>` : ""}
        <div class="item-facts">${facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join("")}</div>
        <div class="item-info-grid">
          ${itemInfoBlock("Obtido por coleta", gathering)}
          ${itemInfoBlock("Produzido em receita", production)}
          ${itemInfoBlock("Gerado por uso", transformations)}
          ${itemInfoBlock("Produção de setor", villageProduction)}
          ${itemInfoBlock("Usado em receitas", item.usedInRecipes)}
          ${itemInfoBlock("Exigido por técnicas", item.requiredByAbilities)}
          ${itemInfoBlock("À venda em", item.soldBy)}
          ${itemInfoBlock("Comprado por", item.boughtBy)}
          ${itemInfoBlock("Restauração", restoration)}
        </div>
        ${abilityMarkup(item.basicAbility, basicCommand)}
        ${abilityMarkup(item.throwAbility, `/arremessar ${item.id} alvo`)}
      </div>`;
    }

    function itemsMarkup() {
      const items = runtimeCatalog?.items || [];
      const categoriesRuntime = runtimeCatalog?.categories || [];
      if (!items.length || !categoriesRuntime.length) return catalogContractError("itens");
      const unarmed = runtimeCatalog?.unarmedAttack
        ? `<section class="equipment-group"><h3 class="equipment-group-title"><span aria-hidden="true">👊</span>Sem arma equipada</h3><div class="guide-equipment-grid"><article class="equipment-card"><div class="equipment-card-head"><div><small>Ataque desarmado</small><h4>${escapeHtml(runtimeCatalog.unarmedAttack.name)}</h4></div></div>${abilityMarkup(runtimeCatalog.unarmedAttack, "/atacar alvo")}</article></div></section>`
        : "";
      const groups = categoriesRuntime.map((category) => {
        const categoryItems = items.filter((item) => item.category === category.id);
        if (!categoryItems.length) return "";
        return `<section class="equipment-group" data-entry-group>
          <h3 class="equipment-group-title"><span aria-hidden="true">${escapeHtml(category.icon)}</span>${escapeHtml(category.label)}</h3>
          <div class="guide-equipment-grid">${categoryItems.map((item) => {
            const searchValue = normalize(`${category.label} ${collectText(item).join(" ")}`);
            return `<details class="equipment-card item-card" id="item-${escapeHtml(item.id)}" data-entry data-entry-id="${escapeHtml(item.id)}" data-filter-value="${escapeHtml(item.category)}" data-search-value="${escapeHtml(searchValue)}">
              <summary class="item-card-summary">
                <img class="item-card-icon" src="${escapeHtml(assetUrl(item.icon))}" alt="" loading="lazy">
                <span class="item-card-heading"><small>${escapeHtml(category.label)}</small><strong>${escapeHtml(item.name)}</strong><span class="equipment-actions">${(item.actions || []).map((action) => `<span>${escapeHtml(action.label)}</span>`).join("")}</span></span>
                <span class="compendium-chevron" aria-hidden="true">⌄</span>
              </summary>
              ${itemDetailMarkup(item)}
            </details>`;
          }).join("")}</div>
        </section>`;
      }).join("");
      return `${unarmed}<div class="compendium item-compendium" data-compendium="items">
        <div class="compendium-toolbar">
          <label class="compendium-search"><span class="sr-only">Pesquisar itens</span><input type="search" placeholder="Pesquisar item, área, receita ou loja..." data-compendium-search></label>
          <div class="compendium-filters" aria-label="Filtrar por tipo de item">
            <button class="active" type="button" data-filter="all" aria-pressed="true">Todos</button>
            ${categoriesRuntime.map((category) => `<button type="button" data-filter="${escapeHtml(category.id)}" aria-pressed="false">${escapeHtml(category.label)}</button>`).join("")}
          </div>
        </div>
        <p class="compendium-status" role="status" aria-live="polite"></p>
        ${groups}
      </div>`;
    }

    function effectsMarkup() {
      const groups = runtimeCatalog?.effectGroups || [];
      if (!groups.length) return commandsMarkup({ groupIds: [] });
      return groups.map((group) => `<section class="effect-group">
        <h3 class="effect-group-title">${escapeHtml(group.title)}</h3>
        <div class="effect-grid">${group.effects.map((effect) => `<article class="effect-card"><strong>${escapeHtml(effect.label)}</strong><p>${escapeHtml(effect.description)}</p></article>`).join("")}</div>
      </section>`).join("");
    }

    function cardsMarkup(block) {
      return `<div class="guide-info-grid">${(block.items || []).map((item) => `<article class="guide-info-card">
        ${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ""}
        <h3>${escapeHtml(item.title)}</h3>
        <p>${inline(item.text)}</p>
      </article>`).join("")}</div>`;
    }

    function flowMarkup(block) {
      return `<div class="guide-flow" aria-label="${escapeHtml(block.label || "Progressão")}">${(block.items || []).map((item, index) => `<div class="guide-flow-step"><span>${index + 1}</span><strong>${escapeHtml(item.title || item)}</strong>${item.text ? `<small>${inline(item.text)}</small>` : ""}</div>`).join('<span class="guide-flow-arrow" aria-hidden="true">→</span>')}</div>`;
    }

    function linksMarkup(block) {
      return `<div class="guide-link-grid">${(block.items || []).map((item) => `<a class="guide-link-card" href="${guideHref(item.slug, item.section)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text || "Abrir guia")}</small></span><span aria-hidden="true">→</span></a>`).join("")}</div>`;
    }

    function traitsMarkup() {
      const traits = runtimeCatalog?.traits || [];
      if (!traits.length) return catalogContractError("Traits");
      const rarities = [...new Map(traits.map((trait) => [trait.rarity, trait.rarityLabel])).entries()];
      return `<div class="compendium" data-compendium="traits">
        <div class="compendium-toolbar">
          <label class="compendium-search"><span class="sr-only">Pesquisar Traits</span><input type="search" placeholder="Pesquisar Trait..." data-compendium-search></label>
          <div class="compendium-filters" aria-label="Filtrar por raridade">
            <button class="active" type="button" data-filter="all" aria-pressed="true">Todas</button>
            ${rarities.map(([id, label]) => `<button type="button" data-filter="${escapeHtml(id)}" aria-pressed="false">${escapeHtml(label)}</button>`).join("")}
          </div>
        </div>
        <p class="compendium-status" role="status" aria-live="polite"></p>
        <div class="trait-grid">${traits.map((trait) => `<details class="trait-card" id="trait-${escapeHtml(trait.id)}" data-entry data-entry-id="${escapeHtml(trait.id)}" data-filter-value="${escapeHtml(trait.rarity)}" data-search-value="${escapeHtml(normalize(`${trait.name} ${trait.rarityLabel} ${trait.description}`))}">
          <summary><img src="${escapeHtml(assetUrl(trait.icon))}" alt="Ícone da Trait ${escapeHtml(trait.name)}" loading="lazy"><span class="compendium-card-heading"><span class="rarity-badge rarity-${escapeHtml(trait.rarity.toLowerCase())}">${escapeHtml(trait.rarityLabel)}</span><strong>${escapeHtml(trait.name)}</strong><small>Abrir efeito</small></span><span class="compendium-chevron" aria-hidden="true">⌄</span></summary>
          <div class="compendium-card-details"><strong>Efeito</strong><p>${escapeHtml(trait.description)}</p></div>
        </details>`).join("")}</div>
      </div>`;
    }

    function clansMarkup() {
      const groups = runtimeCatalog?.clanGroups || [];
      const clans = groups.flatMap((group) => group.clans || []);
      if (!clans.length) return catalogContractError("Clãs");
      return `<div class="compendium" data-compendium="clans">
        <div class="compendium-toolbar">
          <label class="compendium-search"><span class="sr-only">Pesquisar Clãs</span><input type="search" placeholder="Pesquisar Clã..." data-compendium-search></label>
          <div class="compendium-filters" aria-label="Filtrar por Vila">
            <button class="active" type="button" data-filter="all" aria-pressed="true">Todas</button>
            ${groups.map((group) => `<button type="button" data-filter="${escapeHtml(group.id)}" aria-pressed="false">${escapeHtml(group.name)}</button>`).join("")}
          </div>
        </div>
        <p class="compendium-status" role="status" aria-live="polite"></p>
        <div class="clan-grid">${clans.map((clan) => {
          const elements = clan.guaranteedProgressionElements || [];
          const progression = clan.progression;
          const searchValue = normalize(collectText(clan).join(" "));
          return `<details class="clan-card" id="clan-${escapeHtml(clan.id)}" data-entry data-entry-id="${escapeHtml(clan.id)}" data-filter-value="${escapeHtml(clan.villageId)}" data-search-value="${escapeHtml(searchValue)}">
            <summary><img src="${escapeHtml(assetUrl(clan.icon))}" alt="Símbolo do Clã ${escapeHtml(clan.name)}" loading="lazy"><span class="compendium-card-heading"><small>${escapeHtml(clan.villageName)}</small><strong>${escapeHtml(clan.name)}</strong><small>Abrir detalhes</small></span><span class="compendium-chevron" aria-hidden="true">⌄</span></summary>
            <div class="compendium-card-details">
              <strong>Identidade do Clã</strong><p>${escapeHtml(clan.description)}</p>
              ${elements.length ? `<div class="compendium-detail-row"><strong>Afinidades garantidas na progressão</strong><span>${elements.map((element) => `<span class="detail-chip">${escapeHtml(element)}</span>`).join("")}</span></div>` : ""}
              ${progression ? `<div class="compendium-detail-row"><strong>Árvore associada</strong><p>${progression.total} habilidades, incluindo ${progression.techniques.length} técnicas e ${progression.passives} passivas.</p></div>${itemInfoBlock("Técnicas da árvore", progression.techniques)}` : ""}
            </div>
          </details>`;
        }).join("")}</div>
      </div>`;
    }

    function blockMarkup(block) {
      switch (block.type) {
        case "paragraph":
          return `<p class="guide-paragraph">${inline(block.text)}</p>`;
        case "steps":
          return `<ol class="guide-steps">${(block.items || []).map((item) => `<li class="guide-step"><span class="guide-step-marker" aria-hidden="true"></span><div><strong>${inline(item.title)}</strong><p>${inline(item.text)}</p></div></li>`).join("")}</ol>`;
        case "list":
          return `<ul class="guide-list">${(block.items || []).map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`;
        case "callout":
          return `<aside class="guide-callout ${escapeHtml(block.tone || "info")}"><strong>${escapeHtml(block.title)}</strong><p>${inline(block.text)}</p></aside>`;
        case "commands":
          return commandsMarkup(block);
        case "equipment":
          return block.mode === "effects" ? effectsMarkup() : itemsMarkup();
        case "cards":
          return cardsMarkup(block);
        case "flow":
          return flowMarkup(block);
        case "links":
          return linksMarkup(block);
        case "traits":
          return traitsMarkup();
        case "clans":
          return clansMarkup();
        case "faq":
          return `<div class="guide-faq">${(block.items || []).map((item) => `<details><summary>${escapeHtml(item.question)}</summary><div>${inline(item.answer)}</div></details>`).join("")}</div>`;
        default:
          return "";
      }
    }

    function tocMarkup(guide, mobile = false) {
      const links = guide.sections.map((section, index) => `<button class="toc-link${index === 0 ? " active" : ""}" type="button" data-section="${escapeHtml(section.id)}"${index === 0 ? ' aria-current="location"' : ""}>${escapeHtml(section.title)}</button>`).join("");
      if (mobile) return `<details class="guide-toc-mobile"><summary>Neste guia</summary><nav aria-label="Neste guia">${links}</nav></details>`;
      return `<aside class="guide-toc"><nav aria-label="Neste guia"><strong>Neste guia</strong>${links}</nav></aside>`;
    }

    function sidebarMarkup(guide) {
      return `<aside class="guides-sidebar">
        <nav aria-label="Guias">
          <div class="guides-sidebar-head"><a href="#/guias"><span aria-hidden="true">←</span> Central de Guias</a></div>
          ${categories.map((category) => {
            const entries = guides.filter((entry) => entry.category === category.id);
            if (!entries.length) return "";
            return `<section><strong class="guides-sidebar-category"><span class="sidebar-category-icon">${guideIcon(category.icon)}</span>${escapeHtml(category.title)}</strong>${entries.map((entry) => `<a class="sidebar-link${entry.slug === guide.slug ? " active" : ""}" href="${guideHref(entry.slug)}"${entry.slug === guide.slug ? ' aria-current="page"' : ""}>${escapeHtml(entry.title)}${completed.has(entry.slug) ? '<span aria-label="Concluído">✓</span>' : ""}</a>`).join("")}</section>`;
          }).join("")}
        </nav>
      </aside>`;
    }

    function relatedMarkup(guide) {
      const related = (guide.related || []).map((slug) => guideBySlug.get(slug)).filter(Boolean).slice(0, 3);
      if (!related.length) return "";
      return `<section class="guide-related" aria-labelledby="relatedTitle"><div class="section-heading"><div><span class="guides-eyebrow">Continue explorando</span><h2 id="relatedTitle">Guias relacionados</h2></div></div><div class="related-grid">${related.map((entry) => guideCard(entry, true)).join("")}</div></section>`;
    }

    function paginationMarkup(guide) {
      const index = guides.findIndex((entry) => entry.slug === guide.slug);
      const previous = guides[index - 1];
      const next = guides[index + 1];
      return `<nav class="guide-pagination" aria-label="Paginação dos guias">
        ${previous ? `<a href="${guideHref(previous.slug)}"><small>← Guia anterior</small><strong>${escapeHtml(previous.title)}</strong></a>` : "<span></span>"}
        ${next ? `<a href="${guideHref(next.slug)}"><small>Próximo guia →</small><strong>${escapeHtml(next.title)}</strong></a>` : "<span></span>"}
      </nav>`;
    }

    function articleMarkup(guide) {
      const category = categoryOf(guide);
      const isComplete = completed.has(guide.slug);
      return `<div class="guides-shell guide-layout">
        ${sidebarMarkup(guide)}
        <article class="guide-article" id="guideArticle">
          <nav class="guide-breadcrumb" aria-label="Navegação estrutural"><ol><li><a href="#/guias">Guias</a></li><li><span aria-hidden="true">/</span>${escapeHtml(category.title)}</li><li><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(guide.title)}</span></li></ol></nav>
          <header class="guide-header">
            <div class="guide-header-icon">${guideIcon(guide.icon)}</div>
            <div>
              <div class="guide-header-meta"><span class="guide-type">${guide.type === "reference" ? "Referência" : "Guia"}</span><span class="guide-reading-time">${escapeHtml(readingLabel(guide))}</span></div>
              <h1 tabindex="-1">${escapeHtml(guide.title)}</h1>
              <p>${escapeHtml(guide.description)}</p>
              <button class="guide-complete-btn${isComplete ? " is-complete" : ""}" id="guideComplete" type="button" aria-pressed="${isComplete}">${isComplete ? "✓ Guia concluído" : "Marcar como concluído"}</button>
            </div>
          </header>
          ${tocMarkup(guide, true)}
          <div class="guide-content">${guide.sections.map((section) => `<section class="guide-section" id="guide-section-${escapeHtml(section.id)}"><h2 tabindex="-1">${escapeHtml(section.title)}</h2>${(section.blocks || []).map(blockMarkup).join("")}</section>`).join("")}</div>
          ${relatedMarkup(guide)}
          ${paginationMarkup(guide)}
        </article>
        ${tocMarkup(guide)}
      </div>`;
    }

    function setActiveToc(sectionId) {
      root.querySelectorAll(".toc-link").forEach((link) => {
        const active = link.dataset.section === sectionId;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }

    function bindArticle(guide) {
      root.querySelectorAll(".toc-link").forEach((link) => link.addEventListener("click", () => {
        const section = root.querySelector(`#guide-section-${escapedSelector(link.dataset.section)}`);
        section?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        setActiveToc(link.dataset.section);
      }));

      root.querySelector("#guideComplete")?.addEventListener("click", () => {
        if (completed.has(guide.slug)) completed.delete(guide.slug);
        else completed.add(guide.slug);
        saveCompleted(completed);
        const button = root.querySelector("#guideComplete");
        const isComplete = completed.has(guide.slug);
        button?.classList.toggle("is-complete", isComplete);
        button?.setAttribute("aria-pressed", String(isComplete));
        if (button) button.textContent = isComplete ? "✓ Guia concluído" : "Marcar como concluído";
      });

      root.querySelectorAll("[data-compendium]").forEach((compendium) => {
        let filter = "all";
        let term = "";
        const entries = [...compendium.querySelectorAll("[data-entry]")];
        const status = compendium.querySelector(".compendium-status");
        const update = () => {
          let visible = 0;
          for (const entry of entries) {
            const show = matchesCompendiumEntry(
              entry.dataset.filterValue,
              entry.dataset.searchValue,
              filter,
              term,
            );
            entry.classList.toggle("hidden", !show);
            if (!show && entry.matches("details")) entry.open = false;
            if (show) visible += 1;
          }
          compendium.querySelectorAll("[data-entry-group]").forEach((group) => {
            const hasVisibleEntry = [...group.querySelectorAll("[data-entry]")]
              .some((entry) => !entry.classList.contains("hidden"));
            group.classList.toggle("hidden", !hasVisibleEntry);
          });
          if (status) status.textContent = `${visible} ${visible === 1 ? "resultado" : "resultados"}`;
        };
        compendium.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
          filter = button.dataset.filter;
          compendium.querySelectorAll("[data-filter]").forEach((entry) => {
            const active = entry === button;
            entry.classList.toggle("active", active);
            entry.setAttribute("aria-pressed", String(active));
          });
          update();
        }));
        compendium.querySelector("[data-compendium-search]")?.addEventListener("input", (event) => {
          term = event.target.value;
          update();
        });
        update();
      });

      if ("IntersectionObserver" in window) {
        sectionObserver = new IntersectionObserver((entries) => {
          const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          const heading = visible[0]?.target;
          if (heading) setActiveToc(heading.id.replace("guide-section-", ""));
        }, { root: scrollContainer, rootMargin: "-12% 0px -70% 0px", threshold: [0, 1] });
        root.querySelectorAll(".guide-section").forEach((section) => sectionObserver.observe(section));
      }
    }

    function disconnectArticleObservers() {
      sectionObserver?.disconnect();
      sectionObserver = null;
    }

    function showGuide(slug, sectionId) {
      const guide = guideBySlug.get(slug);
      if (!guide) {
        showNotFound();
        return false;
      }
      activeSlug = slug;
      disconnectArticleObservers();
      scrollContainer.scrollTop = 0;
      progress?.classList.remove("hidden");
      if (progressBar) progressBar.style.width = "0%";
      root.innerHTML = articleMarkup(guide);
      bindArticle(guide);
      document.title = `${guide.title} — Guias`;
      requestAnimationFrame(() => {
        if (sectionId) {
          const section = root.querySelector(`#guide-section-${escapedSelector(sectionId)}`);
          if (section) {
            section.scrollIntoView({ block: "start" });
            section.querySelector("h2")?.focus({ preventScroll: true });
            setActiveToc(sectionId);
          } else {
            root.querySelector("h1")?.focus({ preventScroll: true });
          }
        } else {
          root.querySelector("h1")?.focus({ preventScroll: true });
        }
      });
      return true;
    }

    function showNotFound() {
      activeSlug = null;
      disconnectArticleObservers();
      progress?.classList.add("hidden");
      root.innerHTML = `<div class="guides-shell"><section class="empty-results standalone"><span aria-hidden="true">404</span><h1 tabindex="-1">Guia não encontrado</h1><p>Este endereço não corresponde a um guia publicado.</p><a class="btn-primary" href="#/guias">Voltar à Central de Guias</a></section></div>`;
      document.title = "Guia não encontrado — Arquivo Shinobi";
      requestAnimationFrame(() => root.querySelector("h1")?.focus({ preventScroll: true }));
    }

    function onScroll() {
      if (!activeSlug || !progressBar) return;
      const max = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, scrollContainer.scrollTop / max)) : 1;
      progressBar.style.width = `${Math.round(ratio * 100)}%`;
    }

    scrollContainer.addEventListener("scroll", onScroll, { passive: true });

    return {
      showHome,
      showGuide,
      setRuntime(nextRuntime) {
        const changed = runtimeCatalog !== nextRuntime;
        runtimeCatalog = nextRuntime;
        if (changed) {
          if (activeSlug) showGuide(activeSlug);
          else showHome();
        }
      },
      hasGuide(slug) { return guideBySlug.has(slug); },
      destroy() {
        disconnectArticleObservers();
        scrollContainer.removeEventListener("scroll", onScroll);
      },
    };
  }

  window.GuideCenter = { create: createGuideCenter, matchesCompendiumEntry };
})();
