"use strict";

// Renderer da Central de Guias. O conteúdo editorial mora em guides.js e os
// dados que mudam com o jogo (comandos, itens e efeitos) continuam vindo da API.
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

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const inline = (value) => escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");

  const normalize = (value) => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

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
      return categoryById.get(guide.category) || { id: guide.category, title: guide.category, icon: "•" };
    }

    function readingLabel(guide) {
      const minutes = Number(guide.readingTime) || 1;
      return `${minutes} min de leitura`;
    }

    function guideHref(slug) {
      return `#/guias/${encodeURIComponent(slug)}`;
    }

    function completedBadge(slug) {
      return completed.has(slug) ? '<span class="guide-complete-badge">✓ Concluído</span>' : "";
    }

    function guideCard(guide, compact = false) {
      const category = categoryOf(guide);
      return `<a class="guide-card${compact ? " compact" : ""}${completed.has(guide.slug) ? " is-complete" : ""}" href="${guideHref(guide.slug)}">
        <span class="guide-card-icon" aria-hidden="true">${escapeHtml(guide.icon)}</span>
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
            <span class="guides-eyebrow">Base de conhecimento shinobi</span>
            <h1 tabindex="-1">Aprenda tudo sobre o bot</h1>
            <p>Encontre o próximo passo, entenda as regras e consulte comandos sem sair do seu pergaminho.</p>
            <div class="guides-summary" aria-label="Resumo da Central">
              <span><b>${guides.length}</b> guias</span>
              <span><b>${categories.length}</b> categorias</span>
              <span><b>${completeCount}</b> concluídos</span>
            </div>
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
          ${categories.map((category) => `<button class="category-tab${activeCategory === category.id ? " active" : ""}" type="button" data-category="${escapeHtml(category.id)}" aria-pressed="${activeCategory === category.id}"><span aria-hidden="true">${escapeHtml(category.icon)}</span>${escapeHtml(category.title)}</button>`).join("")}
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
      if (!selected.length) {
        return '<aside class="guide-callout info"><strong>Referência indisponível</strong><p>Os comandos não puderam ser carregados agora. Tente atualizar a página.</p></aside>';
      }
      return `<div class="guide-command-groups">${selected.map((group) => `<section class="command-group">
        <h3><span aria-hidden="true">${escapeHtml(group.icon)}</span>${escapeHtml(group.title)}</h3>
        <div class="command-grid">${group.commands.map((entry) => `<article class="command-card"><code>${escapeHtml(entry.command)}</code><p>${escapeHtml(entry.description)}</p></article>`).join("")}</div>
      </section>`).join("")}</div>`;
    }

    function itemsMarkup() {
      const items = runtimeCatalog?.items || [];
      const categoriesRuntime = runtimeCatalog?.categories || [];
      if (!items.length) return commandsMarkup({ groupIds: [] });
      const unarmed = runtimeCatalog?.unarmedAttack
        ? `<section class="equipment-group"><h3 class="equipment-group-title"><span aria-hidden="true">👊</span>Sem arma equipada</h3><div class="guide-equipment-grid"><article class="equipment-card"><div class="equipment-card-head"><div><small>Ataque desarmado</small><h4>${escapeHtml(runtimeCatalog.unarmedAttack.name)}</h4></div></div>${abilityMarkup(runtimeCatalog.unarmedAttack, "/atacar alvo")}</article></div></section>`
        : "";
      return unarmed + categoriesRuntime.map((category) => {
        const categoryItems = items.filter((item) => item.category === category.id);
        if (!categoryItems.length) return "";
        return `<section class="equipment-group">
          <h3 class="equipment-group-title"><span aria-hidden="true">${escapeHtml(category.icon)}</span>${escapeHtml(category.label)}</h3>
          <div class="guide-equipment-grid">${categoryItems.map((item) => {
            const isEquippable = item.actions.some((action) => action.id === "EQUIP");
            const basicCommand = isEquippable ? "/atacar alvo" : `/usar ${item.id}`;
            return `<article class="equipment-card">
              <div class="equipment-card-head"><div><small>${escapeHtml(category.label)}</small><h4>${escapeHtml(item.name)}</h4></div><div class="equipment-actions">${item.actions.map((action) => `<span>${escapeHtml(action.label)}</span>`).join("")}</div></div>
              <p class="equipment-description">${escapeHtml(item.description)}</p>
              ${item.specialRule ? `<p class="equipment-special">${escapeHtml(item.specialRule)}</p>` : ""}
              ${abilityMarkup(item.basicAbility, basicCommand)}
              ${abilityMarkup(item.throwAbility, `/arremessar ${item.id} alvo`)}
            </article>`;
          }).join("")}</div>
        </section>`;
      }).join("");
    }

    function effectsMarkup() {
      const groups = runtimeCatalog?.effectGroups || [];
      if (!groups.length) return commandsMarkup({ groupIds: [] });
      return groups.map((group) => `<section class="effect-group">
        <h3 class="effect-group-title">${escapeHtml(group.title)}</h3>
        <div class="effect-grid">${group.effects.map((effect) => `<article class="effect-card"><strong>${escapeHtml(effect.label)}</strong><p>${escapeHtml(effect.description)}</p></article>`).join("")}</div>
      </section>`).join("");
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
            return `<section><strong class="guides-sidebar-category"><span aria-hidden="true">${escapeHtml(category.icon)}</span>${escapeHtml(category.title)}</strong>${entries.map((entry) => `<a class="sidebar-link${entry.slug === guide.slug ? " active" : ""}" href="${guideHref(entry.slug)}"${entry.slug === guide.slug ? ' aria-current="page"' : ""}>${escapeHtml(entry.title)}${completed.has(entry.slug) ? '<span aria-label="Concluído">✓</span>' : ""}</a>`).join("")}</section>`;
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
            <div class="guide-header-icon" aria-hidden="true">${escapeHtml(guide.icon)}</div>
            <div>
              <div class="guide-header-meta"><span class="guide-type">${guide.type === "reference" ? "Referência" : "Guia"}</span><span class="guide-reading-time">${escapeHtml(readingLabel(guide))}</span></div>
              <h1 tabindex="-1">${escapeHtml(guide.title)}</h1>
              <p>${escapeHtml(guide.description)}</p>
              <button class="guide-complete-btn${isComplete ? " is-complete" : ""}" id="guideComplete" type="button" aria-pressed="${isComplete}">${isComplete ? "✓ Guia concluído" : "Marcar como concluído"}</button>
            </div>
          </header>
          ${tocMarkup(guide, true)}
          <div class="guide-content">${guide.sections.map((section) => `<section class="guide-section" id="guide-section-${escapeHtml(section.id)}"><h2>${escapeHtml(section.title)}</h2>${(section.blocks || []).map(blockMarkup).join("")}</section>`).join("")}</div>
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

    function showGuide(slug) {
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
      requestAnimationFrame(() => root.querySelector("h1")?.focus({ preventScroll: true }));
      return true;
    }

    function showNotFound() {
      activeSlug = null;
      disconnectArticleObservers();
      progress?.classList.add("hidden");
      root.innerHTML = `<div class="guides-shell"><section class="empty-results standalone"><span aria-hidden="true">404</span><h1 tabindex="-1">Guia não encontrado</h1><p>Este endereço pode ter mudado ou o conteúdo ainda não está disponível.</p><a class="btn-primary" href="#/guias">Voltar à Central de Guias</a></section></div>`;
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
      setRuntime(nextRuntime) { runtimeCatalog = nextRuntime; },
      hasGuide(slug) { return guideBySlug.has(slug); },
      destroy() {
        disconnectArticleObservers();
        scrollContainer.removeEventListener("scroll", onScroll);
      },
    };
  }

  window.GuideCenter = { create: createGuideCenter };
})();
