/* ================================================================
   Aba de Ingots — moeda premium do servidor.

   Mesma divisao de guides.js: os dados editaveis ficam em INGOTS_PAGE
   no topo, o renderer embaixo so' desenha o que estiver aqui. Mexer em
   texto, secao ou card nao exige tocar no renderer.

   O saldo e os Giros ficam vinculados a conta do Discord no servidor.
   ================================================================ */

window.INGOTS_PAGE = {
  eyebrow: "Economia premium",
  title: "Ingots",
  lead: "A moeda de apoio do servidor. Separada do Ryo, nunca cai de missão nem de drop — e não compra poder de combate.",
  // Resumo rapido no topo, em tres numeros. Valor "—" aparece como
  // pendente na tela, entao da' pra publicar a pagina antes de fechar
  // os numeros sem que ela pareca quebrada.
  facts: [
    { label: "Sigla", value: "IGT" },
    { label: "Transferível", value: "Não" },
    { label: "Expira", value: "Nunca" },
  ],

  sections: [
    {
      id: "o-que-e",
      title: "O que é um Ingot",
      intro: "Ingot é a moeda de apoio ao servidor. Ela existe fora da economia do jogo: não entra em loja de vila, não paga imposto e não é afetada por taxa nem por confisco.",
      cards: [
        {
          icon: "economy",
          title: "Fora da economia de Ryo",
          text: "Ryo circula entre jogadores, sofre imposto e some quando você morre. Ingot fica preso à sua conta do Discord e sobrevive a qualquer reset de personagem.",
        },
        {
          icon: "fair",
          title: "Nunca compra vantagem",
          text: "Nada que altere dano, atributo, jutsu ou resultado de combate é vendido por Ingot. A regra é dura de propósito: quem não gasta não fica para trás.",
        },
        {
          icon: "account",
          title: "Vinculado à conta",
          text: "Não dá para transferir, doar nem vender Ingot para outro jogador. Isso mata mercado paralelo e golpe de troca antes de existir.",
        },
      ],
    },
    {
      id: "como-conseguir",
      title: "Como conseguir",
      intro: "Ingot entra na sua conta por apoio direto ou por reconhecimento do staff. Não existe farm.",
      cards: [
        {
          icon: "support",
          title: "Apoiar o servidor",
          text: "Contribuições mantêm a hospedagem e o banco de dados no ar. O pacote e o valor são anunciados no canal de apoio.",
          meta: "Quantidade: a definir",
        },
        {
          icon: "event",
          title: "Eventos e torneios",
          text: "Premiação de eventos oficiais conduzidos pelo staff. Distribuído manualmente ao fim do evento.",
          meta: "Quantidade: a definir",
        },
        {
          icon: "content",
          title: "Contribuição de conteúdo",
          text: "Arte, lore aproveitada, correção de bug reportada com repro. Avaliado caso a caso pelo staff.",
          meta: "Quantidade: a definir",
        },
      ],
    },
    {
      id: "no-que-gastar",
      title: "No que gastar",
      intro: "Use `/loja-premium` para comprar e usar Giros. Nada é vendido com efeito de combate.",
      cards: [
        {
          icon: "clan",
          title: "Giro de Clã",
          text: "Permite sortear outro Clã da Vila de origem enquanto o personagem ainda for da Academia.",
          meta: "Custo: 100 Ingots",
        },
        {
          icon: "trait",
          title: "Giro de Traço",
          text: "Permite obter um novo Traço usando as probabilidades normais. Um resultado Mítico deixa você escolher entre as opções sorteadas.",
          meta: "Custo: 100 Ingots",
        },
      ],
    },
    {
      id: "regras",
      title: "Regras",
      intro: "Leia antes de gastar. Estas condições não abrem exceção.",
      list: [
        "Ingot não é reembolsável. Compra feita é compra fechada, inclusive se você errar o item.",
        "Ingot não pode ser transferido, doado ou vendido a outro jogador, dentro ou fora do servidor.",
        "Venda de Ingot ou de conta por dinheiro real resulta em banimento e perda do saldo.",
        "O saldo sobrevive à morte permanente do personagem — está na conta, não na ficha.",
        "O staff pode ajustar preço e catálogo. Saldo já comprado nunca é removido por reajuste.",
      ],
    },
  ],

  // Duvidas que ja apareceram no servidor. Mantido curto de proposito:
  // FAQ longa vira lugar onde ninguem le'.
  faq: [
    {
      question: "Ingot deixa meu personagem mais forte?",
      answer: "Não. Nenhum item comprável com Ingot altera atributo, dano, jutsu, recurso ou resultado de combate. Essa é a regra central da moeda.",
    },
    {
      question: "Perdi meu personagem na morte permanente. Perdi os Ingots?",
      answer: "Não. O saldo fica vinculado à sua conta do Discord, não à ficha. Ele continua lá quando você criar o próximo personagem.",
    },
    {
      question: "Posso passar Ingots pro meu amigo?",
      answer: "Não. Transferência entre jogadores está bloqueada por design, para não criar mercado paralelo nem golpe de troca.",
    },
    {
      question: "Consigo trocar Ingot por Ryo?",
      answer: "Não. As duas moedas não conversam. Ryo se ganha jogando; Ingot não compra economia de jogo.",
    },
  ],
};

window.IngotsPage = (function () {
  const INGOT_ICON_SPRITE = "/assets/guides/ingot-icons.svg";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
    ));
  }

  // Valor ainda nao definido aparece como "pendente" em vez de sumir: a
  // lacuna precisa ficar visivel pra ser preenchida, nao escondida.
  function factMarkup(fact) {
    const pending = !fact.value || fact.value === "—";
    return `<div class="ingot-fact${pending ? " is-pending" : ""}">
      <dt>${escapeHtml(fact.label)}</dt>
      <dd>${escapeHtml(pending ? "A definir" : fact.value)}</dd>
    </div>`;
  }

  function ingotIcon(icon) {
    const safeIcon = /^[a-z0-9-]+$/i.test(String(icon || "")) ? icon : "economy";
    return `<svg aria-hidden="true" viewBox="0 0 48 48"><use href="${INGOT_ICON_SPRITE}#ingot-${escapeHtml(safeIcon)}"></use></svg>`;
  }

  function cardMarkup(card) {
    return `<article class="ingot-card">
      <div class="ingot-card-icon">${ingotIcon(card.icon)}</div>
      <div class="ingot-card-body">
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.text)}</p>
        ${card.meta ? `<span class="ingot-card-meta">${escapeHtml(card.meta)}</span>` : ""}
      </div>
    </article>`;
  }

  function sectionMarkup(section) {
    const body = section.list
      ? `<ul class="ingot-rules">${section.list.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>`
      : `<div class="ingot-grid">${(section.cards || []).map(cardMarkup).join("")}</div>`;
    return `<section class="ingot-section" id="ingot-section-${escapeHtml(section.id)}" aria-labelledby="ingot-title-${escapeHtml(section.id)}">
      <div class="section-heading">
        <div>
          <span class="guides-eyebrow">${escapeHtml(section.title)}</span>
          <h2 id="ingot-title-${escapeHtml(section.id)}">${escapeHtml(section.title)}</h2>
        </div>
        ${section.intro ? `<p>${escapeHtml(section.intro)}</p>` : ""}
      </div>
      ${body}
    </section>`;
  }

  function faqMarkup(faq) {
    if (!faq || !faq.length) return "";
    return `<section class="ingot-section" aria-labelledby="ingotFaqTitle">
      <div class="section-heading">
        <div><span class="guides-eyebrow">Dúvidas</span><h2 id="ingotFaqTitle">Perguntas frequentes</h2></div>
      </div>
      <div class="ingot-faq">
        ${faq.map((entry) => `<details class="ingot-faq-item">
          <summary>${escapeHtml(entry.question)}</summary>
          <p>${escapeHtml(entry.answer)}</p>
        </details>`).join("")}
      </div>
    </section>`;
  }

  function pageMarkup(data) {
    return `<div class="guides-shell ingots-shell">
      <header class="ingot-hero">
        <div class="ingot-hero-copy">
          <span class="guides-eyebrow">${escapeHtml(data.eyebrow)}</span>
          <h1 tabindex="-1">${escapeHtml(data.title)}</h1>
          <p>${escapeHtml(data.lead)}</p>
          <dl class="ingot-facts">${(data.facts || []).map(factMarkup).join("")}</dl>
        </div>
        <div class="ingot-hero-visual" aria-hidden="true">
          <img src="/assets/guides/ingots-hero-market.webp" alt="" decoding="async">
        </div>
      </header>

      <p class="ingot-draft-note" role="note">
        Sistema em preparação. Os valores marcados como <strong>a definir</strong> ainda não foram fechados — as regras abaixo já valem.
      </p>

      ${(data.sections || []).map(sectionMarkup).join("")}
      ${faqMarkup(data.faq)}
    </div>`;
  }

  function create({ root, scrollContainer, data }) {
    const page = data || window.INGOTS_PAGE;

    function show() {
      root.innerHTML = pageMarkup(page);
      document.title = `${page.title} — Arquivo Shinobi`;
      if (scrollContainer) scrollContainer.scrollTop = 0;
      root.querySelector("h1")?.focus({ preventScroll: true });
    }

    return { show };
  }

  return { create };
})();
