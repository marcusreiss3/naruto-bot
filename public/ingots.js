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
  lead: "A moeda de apoio do servidor. Separada do Ryo, nunca cai de missão nem de drop — e não compra dano, atributo ou jutsu diretamente.",
  // Resumo rapido no topo, em tres numeros. Valor "—" aparece como
  // pendente na tela, entao da' pra publicar a pagina antes de fechar
  // os numeros sem que ela pareca quebrada.
  facts: [
    { label: "Sigla", value: "IGT" },
    { label: "Transferível", value: "Não" },
    { label: "Expira", value: "Nunca" },
  ],

  packages: [
    { id: "01", title: "Pequeno Cofre", icon: "/assets/ingots/packages/pequeno-cofre.png", ingots: "Quantidade a definir", price: "R$ —" },
    { id: "02", title: "Bolsa de Ryo", icon: "/assets/ingots/packages/bolsa-ryo.png", ingots: "Quantidade a definir", price: "R$ —" },
    { id: "03", title: "Caixa de Suprimentos", icon: "/assets/ingots/packages/caixa-suprimentos.png", ingots: "Quantidade a definir", price: "R$ —" },
    { id: "04", title: "Baú do Mercador", icon: "/assets/ingots/packages/bau-mercador.png", ingots: "Quantidade a definir", price: "R$ —" },
    { id: "05", title: "Tesouro do Daimyō", icon: "/assets/ingots/packages/tesouro-daimyo.png", ingots: "Quantidade a definir", price: "R$ —" },
    { id: "06", title: "Reserva do Hokage", icon: "/assets/ingots/packages/reserva-hokage.png", ingots: "Quantidade a definir", price: "R$ —" },
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
          title: "Sem compra direta de poder",
          text: "Ingots não vendem dano, atributo ou jutsu específicos. Giros de Clã e de Traço seguem as probabilidades normais: eles podem influenciar sua progressão, mas não permitem comprar um resultado garantido.",
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
      intro: "Ingot entra na sua conta por apoio direto, Missões Diárias e premiações oficiais. Não existe farm livre e infinito.",
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
          title: "Missões Diárias",
          text: "Complete as Missões Diárias para receber Ingots gratuitamente. As condições e a quantidade são exibidas no painel da missão.",
          meta: "Quantidade: a definir",
        },
      ],
    },
    {
      id: "no-que-gastar",
      title: "No que gastar",
      intro: "Use `/loja-premium` para comprar e usar Giros, receber Ryō ou reorganizar sua progressão. Um Giro não permite escolher diretamente um Clã ou Traço específico.",
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
        {
          icon: "economy",
          title: "10.000 Ryō",
          text: "Adiciona 10.000 Ryō diretamente ao saldo do personagem.",
          meta: "Custo: 100 Ingots",
        },
        {
          icon: "account",
          title: "Reset de atributos",
          text: "Devolve os pontos investidos, zera os atributos e remove as habilidades aprendidas nas Árvores de Habilidade.",
          meta: "Custo: 100 Ingots",
        },
        {
          icon: "account",
          title: "Reset premium de personagem",
          text: "Permite refazer nome, rank, idade, história e aparência; também devolve os pontos investidos e remove as habilidades aprendidas nas Árvores de Habilidade. O rank volta para Academia, permitindo usar Giros de Clã novamente. Mantém nível, XP, Vila, Clã, Traço, inventário, Ryō, Ingots e Giros.",
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
      answer: "Pode influenciar sua progressão de forma indireta: Ingots compram Giros de Clã e de Traço, e um Traço pode ter efeito mecânico. Não existe compra direta ou garantida de atributo, dano, jutsu, Clã ou Traço específico; os Giros usam as probabilidades normais.",
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
  const INGOT_ICON_SPRITE = "/assets/guides/ingot-icons.svg?v=ingot-packages-1";
  const assetUrl = (path) => (window.assetUrl ? window.assetUrl(path) : path);

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
        ${card.meta && card.meta !== "Quantidade: a definir" ? `<span class="ingot-card-meta">${escapeHtml(card.meta)}</span>` : ""}
      </div>
    </article>`;
  }

  function packageMarkup(pkg) {
    return `<article class="ingot-package">
      <span class="ingot-package-index">Pacote ${escapeHtml(pkg.id)}</span>
      <div class="ingot-package-art">
        <span class="ingot-package-pile" aria-hidden="true">${ingotIcon("stack")}</span>
        <img src="${escapeHtml(assetUrl(pkg.icon))}" alt="" loading="lazy" decoding="async">
      </div>
      <h3>${escapeHtml(pkg.title)}</h3>
      <dl class="ingot-package-facts">
        <div><dt>Ingots</dt><dd>${escapeHtml(pkg.ingots)}</dd></div>
        <div><dt>Valor</dt><dd>${escapeHtml(pkg.price)}</dd></div>
      </dl>
      <button class="ingot-package-buy" type="button" data-package-id="${escapeHtml(pkg.id)}">Comprar via PIX</button>
    </article>`;
  }

  function packagesMarkup(packages) {
    if (!packages?.length) return "";
    return `<section class="ingot-section ingot-packages-section" aria-labelledby="ingotPackagesTitle">
      <div class="section-heading">
        <div><span class="guides-eyebrow">Loja premium</span><h2 id="ingotPackagesTitle">Pacotes de Ingots</h2></div>
        <p>Os valores e as quantidades serão divulgados antes da abertura. O botão já mostra como funcionará o pagamento por PIX.</p>
      </div>
      <div class="ingot-packages-grid">${packages.map(packageMarkup).join("")}</div>
    </section>`;
  }

  function paymentModalMarkup() {
    return `<div class="ingot-payment-modal hidden" id="ingotPaymentModal" role="dialog" aria-modal="true" aria-labelledby="ingotPaymentTitle">
      <div class="ingot-payment-card" tabindex="-1">
        <button class="ingot-payment-close" type="button" data-close-payment aria-label="Fechar pagamento">×</button>
        <span class="ingot-payment-kicker">Pagamento por PIX</span>
        <h2 id="ingotPaymentTitle">Pacote</h2>
        <p id="ingotPaymentPrice">Valor a definir</p>
        <div class="pix-placeholder" role="img" aria-label="QR Code PIX em preparação">
          <span>PIX</span><small>em breve</small>
        </div>
        <p class="ingot-payment-note">O QR Code e a chave PIX serão disponibilizados quando os pacotes forem definidos. Nenhum pagamento é solicitado nesta etapa.</p>
        <button class="btn-secondary" type="button" data-close-payment>Entendi</button>
      </div>
    </div>`;
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
          <img src="${escapeHtml(assetUrl("/assets/guides/ingots-hero-market.webp"))}" alt="" decoding="async">
        </div>
      </header>

      <p class="ingot-draft-note" role="note">
        Sistema em preparação. Os valores marcados como <strong>a definir</strong> ainda não foram fechados — as regras abaixo já valem.
      </p>

      ${(data.sections || []).map((section) => `${sectionMarkup(section)}${section.id === "no-que-gastar" ? packagesMarkup(data.packages) : ""}`).join("")}
      ${faqMarkup(data.faq)}
      ${paymentModalMarkup()}
    </div>`;
  }

  function create({ root, scrollContainer, data }) {
    const page = data || window.INGOTS_PAGE;

    function show() {
      root.innerHTML = pageMarkup(page);
      bindPaymentModal();
      document.title = `${page.title} — Arquivo Shinobi`;
      if (scrollContainer) scrollContainer.scrollTop = 0;
      root.querySelector("h1")?.focus({ preventScroll: true });
    }

    let paymentReturnFocus = null;

    function bindPaymentModal() {
      const modal = root.querySelector("#ingotPaymentModal");
      const closePayment = () => {
        modal.classList.add("hidden");
        paymentReturnFocus?.focus();
        paymentReturnFocus = null;
      };
      root.onclick = (event) => {
        const buy = event.target.closest("[data-package-id]");
        if (buy) {
          const pkg = page.packages?.find((entry) => entry.id === buy.dataset.packageId);
          if (!pkg) return;
          paymentReturnFocus = buy;
          root.querySelector("#ingotPaymentTitle").textContent = pkg.title;
          root.querySelector("#ingotPaymentPrice").textContent = `${pkg.ingots} · ${pkg.price}`;
          modal.classList.remove("hidden");
          requestAnimationFrame(() => modal.querySelector(".ingot-payment-card")?.focus());
          return;
        }
        if (event.target === modal || event.target.closest("[data-close-payment]")) closePayment();
      };
      root.onkeydown = (event) => {
        if (modal.classList.contains("hidden")) return;
        if (event.key === "Escape") {
          event.preventDefault();
          closePayment();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = [...modal.querySelectorAll("button:not([disabled]), [tabindex]:not([tabindex='-1'])")];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      };
    }

    return { show };
  }

  return { create };
})();
