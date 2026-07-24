"use strict";

// Metadados visuais dos elementos (o servidor manda os dados; isto é só estética).
// FUNDAMENTOS não é um elemento de verdade (é a árvore de ninjutsu básico,
// pré-requisito) — por isso sempre aparece desbloqueada, ver buildElemBar.
const ELEMENTS = [
  { id: "FUNDAMENTOS", name: "Ninjutsu", icon: "", img: "/assets/icons/footer/ninjutsu.png", color: "#8a8a8a" },
  { id: "FOGO", name: "Fogo", icon: "", img: "/assets/icons/footer/katon.png", color: "#e2492d" },
  { id: "AGUA", name: "Água", icon: "", img: "/assets/icons/footer/suiton.png", color: "#2b7fd4" },
  { id: "VENTO", name: "Vento", icon: "", img: "/assets/icons/footer/futon.png", color: "#2fa36b" },
  { id: "TERRA", name: "Terra", icon: "", img: "/assets/icons/footer/doton.png", color: "#c08a3a" },
  { id: "RAIO", name: "Raio", icon: "", img: "/assets/icons/footer/raiton.png", color: "#f0c419" },
  // Kekkei genkai.
  { id: "CRISTAL", name: "Cristal", icon: "", img: "/assets/icons/footer/cristal.png", color: "#e85fa6" },
  { id: "VAPOR", name: "Vapor", icon: "", img: "/assets/icons/footer/vapor.png", color: "#f0857a" },
  { id: "CALOR", name: "Calor", icon: "", img: "/assets/icons/footer/calor.png", color: "#d9662b" },
  { id: "LAVA", name: "Lava", icon: "", img: "/assets/icons/footer/lava.png", color: "#b23a1f" },
  { id: "EXPLOSAO", name: "Explosão", icon: "", img: "/assets/icons/footer/explosao.png", color: "#c9a227" },
  // Árvores de clã (gate por clanId em vez de elemento — ver clanGate abaixo).
  { id: "NARA", name: "Nara", icon: "🌑", color: "#5c5c7a", clanGate: "nara" },
];
// TEMPORARIO: mostra TODOS os elementos no footer (preview de icones), ignorando
// o desbloqueio. Voltar pra false quando terminar de conferir.
const PREVIEW_ALL_ELEMENTS = false;
// Imagem de fundo por elemento (public/assets/bg). Ausente = sem imagem, só o gradiente.
const ELEMENT_BG = {
  FUNDAMENTOS: "url('/assets/bg/ninjutsu.webp')",
  FOGO: "url('/assets/bg/fogo.webp')",
  AGUA: "url('/assets/bg/agua.webp')",
  VENTO: "url('/assets/bg/vento.webp')",
  TERRA: "url('/assets/bg/terra.webp')",
  RAIO: "url('/assets/bg/raio.webp')",
};
// Glossário de efeitos: destaca o termo na descrição e explica no hover.
// A descrição vem do servidor como texto puro; o realce é feito aqui por regex,
// então basta escrever o nome do efeito na desc que ele vira link explicativo.
const GLOSSARY = [
  { re: "Queimadura(?:s)?", tip: "Queimadura: o alvo perde 8 de vida por turno e causa menos dano físico a cada acúmulo. Ao juntar 5 acúmulos, explode por 40 de dano e zera." },
  { re: "Sangramento", tip: "Sangramento: o alvo perde 5 de vida por turno, recebe metade da cura e ainda perde 6 de vida sempre que usa um golpe físico." },
  // ATENCAO: alternativas da MAIS LONGA para a mais curta — a regex casa a primeira
  // que servir, entao "Atordoa" antes de "atordoado" cortaria a palavra no meio.
  { re: "Atordoamento|Atordoarem|Atordoar|atordoados|atordoado|Atordoam|Atordoa", tip: "Atordoamento: o alvo não pode agir nem se mover no turno. Perde a vez." },
  { re: "Encharcando|Encharcad[oa]s|Encharcad[oa]", tip: "Encharcado: o alvo está molhado. Toma dano extra de jutsus de Raio e serve de condutor para acertos em cadeia." },
  { re: "Barreira", tip: "Barreira: escudo que absorve parte do dano recebido antes de descontar da sua vida." },
  { re: "preso(?:s)? ao chão", tip: "Preso ao chão: o alvo não consegue sair do lugar. Ainda pode atacar." },
  { re: "mais lento(?:s)?", tip: "Lentidão: o movimento do alvo cai pela metade." },
  { re: "reduzindo a defesa|reduz a defesa", tip: "Defesa reduzida: o alvo perde 15% de chance de esquivar dos ataques." },
  { re: "não pode(?:m)? ser esquivad[oa](?:s)?", tip: "Não pode ser esquivado: ignora a reação de esquiva do alvo. O ataque sempre acerta." },
  { re: "não consegue fugir|sem poder fugir|não conseguem fugir", tip: "Fuga bloqueada: o alvo não pode usar a ação de fugir do combate enquanto o efeito durar." },
  // ---- exclusivo do clã Nara ----
  { re: "Vínculo de Sombra", tip: "Vínculo de Sombra: sem dano, mas o alvo não pode se mover nem reagir (Esquivar/Bloquear/Aparar) enquanto durar — o corpo dele copia o do usuário. Só uma Esquiva bem-sucedida ANTES do vínculo prender evita o efeito." },
  // ---- kekkei genkai: Cristal ----
  { re: "Cristalizado", tip: "Cristalizado: cristais cravados no corpo do alvo. Cada acúmulo tira 8% de esquiva e 1 de movimento, e não causa dano por turno. Ao juntar 4 acúmulos o cristal se fecha: o alvo é selado (Atordoamento + preso ao chão) e os acúmulos zeram." },
  { re: "selad[oa](?:s)?|selar", tip: "Selado: o casulo de cristal fechou. O alvo fica Atordoado 1 rodada e preso ao chão por 2." },
  { re: "Prisma", tip: "Prisma: casulo de luz sobre você. Corta 60% do dano de Ninjutsu recebido e devolve 30% do que barrou no atacante. Em troca, você fica imóvel e golpes físicos passam inteiros." },
  // ---- kekkei genkai: Vapor ----
  { re: "Corrosão", tip: "Corrosão: névoa corrosiva no corpo do alvo. Causa dano leve por turno e derrete a Barreira (SHIELD) do alvo a cada rodada, ignorando-a por completo." },
  // ---- kekkei genkai: Calor ----
  { re: "Desidrata(?:d[oa])?(?:s)?|Desidratação", tip: "Desidratação: o calor sugou a água do corpo do alvo. Corta uma % de TODO o dano que ele causar (não só físico) enquanto durar." },
  // ---- kekkei genkai: Lava ----
  { re: "Magma", tip: "Magma: lava acumulada no corpo do alvo. Causa dano leve por turno; ao juntar acúmulos suficientes, endurece e prende o alvo (Imobilização), sem Atordoar." },
  { re: "endureceu|endurecer", tip: "Endureceu: o Magma acumulado fechou. O alvo fica preso no lugar (Imobilização), mas continua podendo agir." },
  // ---- kekkei genkai: Explosão ----
  { re: "Minado", tip: "Minado: carga explosiva plantada no corpo do alvo. Não causa dano nenhum enquanto o pavio queima — detona tudo de uma vez quando a duração termina." },
  { re: "defletiu|redireciona(?:r)?", tip: "Explosão Defensiva: contra um projétil (arma arremessada), apara e devolve o golpe inteiro no atacante em vez de só reduzir o dano." },
];
const GLOSSARY_RE = new RegExp("(" + GLOSSARY.map((g) => g.re).join("|") + ")", "gi");

const escHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Envolve cada termo do glossário num <span> com tooltip. Uma passada só (regex
// combinada) para nunca reprocessar o HTML que acabou de ser inserido.
function highlightEffects(text) {
  return escHtml(text).replace(GLOSSARY_RE, (match) => {
    const entry = GLOSSARY.find((g) => new RegExp("^(?:" + g.re + ")$", "i").test(match));
    if (!entry) return match;
    return `<span class="fx" tabindex="0" data-tip="${escHtml(entry.tip)}">${match}</span>`;
  });
}

const glow = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},.5)`;
};

// Layout da árvore (coordenadas lógicas; o container escala).
const CENTER_X = 360, COL_GAP = 150, ROW_GAP = 96, TOP_PAD = 60, WIDTH = 720;

let state = null;      // resposta de /api/state
let activeEl = null;   // elemento em exibição
let modalNode = null;  // nó aberto no modal

const $ = (id) => document.getElementById(id);

async function fetchState() {
  const res = await fetch("/api/state", { credentials: "same-origin" });
  if (res.status === 401) return { authenticated: false };
  return res.json();
}

function show(screen) {
  for (const s of ["login", "nochar", "app"]) $(s).classList.toggle("hidden", s !== screen);
}

function updateTop() {
  $("charName").textContent = state.char.name;
  $("charLevel").textContent = "Nv. " + state.char.level;
  $("charPoints").textContent = state.char.points;
  const t = $("charPointsTotal");
  if (t) t.textContent = " / " + state.char.ninjutsu;
}

// Painel de dossiê (lateral): dados reais do personagem + progresso da árvore ativa.
function updateDossier(elId) {
  if (!state || !state.char) return;
  const c = state.char;
  $("dsName").textContent = c.name;
  $("dsClan").textContent = c.clanName || "Sem clã";
  $("dsLevel").textContent = "Nv. " + c.level;

  // técnicas = nós JUTSU possuídos em todas as árvores
  let techs = 0;
  for (const t of Object.values(state.trees)) {
    for (const n of t) if (n.status === "OWNED" && n.kind === "JUTSU") techs++;
  }
  $("dsTechs").textContent = techs;

  // naturezas de chakra (elementos possuídos)
  const nat = $("dsNatures");
  nat.innerHTML = "";
  if (!c.elements.length) {
    nat.innerHTML = '<span class="nature-empty">Nenhuma desperta</span>';
  } else {
    for (const id of c.elements) {
      const m = ELEMENTS.find((e) => e.id === id);
      if (!m) continue;
      const chip = document.createElement("span");
      chip.className = "nature-chip";
      chip.style.setProperty("--ec", m.color);
      const face = m.img ? `<img src="${m.img}" alt="">` : `<span class="nc-emoji">${m.icon}</span>`;
      chip.innerHTML = `${face}<span>${m.name}</span>`;
      nat.appendChild(chip);
    }
  }

  // pontos de ninjutsu: barra = fração investida
  const spentPct = c.ninjutsu ? Math.min(100, Math.round((c.spent / c.ninjutsu) * 100)) : 0;
  $("dsPointsBar").style.width = spentPct + "%";
  $("dsPointsCap").textContent = `${c.points} livres · ${c.ninjutsu} total`;

  // progresso (domínio) da árvore ativa
  const meta = ELEMENTS.find((e) => e.id === elId);
  const nodes = state.trees[elId] || [];
  const owned = nodes.filter((n) => n.status === "OWNED").length;
  const total = nodes.length;
  const pct = total ? Math.round((owned / total) * 100) : 0;
  $("dsTreeName").textContent = (meta ? meta.name : elId) + " · domínio";
  const tb = $("dsTreeBar");
  tb.style.width = pct + "%";
  tb.style.background = meta ? meta.color : "var(--orange)";
  $("dsTreeCap").textContent = `${owned} / ${total} nós`;
}

// assinatura do estado p/ detectar mudança sem re-renderizar à toa
let lastSig = "";
const sigOf = (s) => JSON.stringify([s.char, s.trees]);

async function boot() {
  state = await fetchState();
  if (!state.authenticated) return show("login");
  if (!state.hasChar) return show("nochar");
  show("app");
  buildElemBar();
  activeEl = state.char.elements[0] || "FUNDAMENTOS";
  updateTop();
  renderTree(activeEl);
  lastSig = sigOf(state);
  startSync();
}

// Auto-refresh: puxa o estado do bot periodicamente e ao focar a aba. Assim,
// distribuir ninjutsu no /atributos (ou admin mexer) reflete no site sozinho.
function startSync() {
  setInterval(pull, 5000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pull(); });
  window.addEventListener("focus", pull);
}

async function pull() {
  let ns;
  try { ns = await fetchState(); } catch { return; }
  if (!ns || !ns.authenticated) { location.reload(); return; } // sessão caiu
  if (!ns.hasChar) return;
  const g = sigOf(ns);
  if (g === lastSig) return; // nada mudou
  state = ns;
  lastSig = g;
  buildElemBar();       // elementos podem ter sido concedidos
  updateTop();
  renderTree(activeEl); // mantém o elemento aberto, atualiza status/pontos
}

function buildElemBar() {
  const bar = $("elembar");
  bar.innerHTML = "";
  for (const e of ELEMENTS) {
    // So aparece o que o personagem tem. FUNDAMENTOS (Ninjutsu) e' sempre
    // desbloqueado; elemento/kekkei genkai que ele nao possui nem aparece;
    // arvore de cla (clanGate) so aparece pra quem e' daquele cla.
    const unlocked =
      e.id === "FUNDAMENTOS" ||
      (e.clanGate ? state.char.clanId === e.clanGate : state.char.elements.includes(e.id));
    if (!unlocked && !PREVIEW_ALL_ELEMENTS) continue;
    const div = document.createElement("div");
    div.className = "elem";
    div.style.setProperty("--ec", e.color);
    div.style.setProperty("--ecg", glow(e.color));
    const eface = e.img
      ? `<img class="e-img" src="${e.img}" alt="" loading="lazy">`
      : e.icon;
    div.innerHTML = `<div class="e-ico">${eface}</div><div class="e-name">${e.name}</div>`;
    div.onclick = () => {
      activeEl = e.id;
      renderTree(e.id);
    };
    div.dataset.el = e.id;
    bar.appendChild(div);
  }
}

function renderTree(elId) {
  const meta = ELEMENTS.find((e) => e.id === elId);
  const nodes = state.trees[elId] || [];
  const ownedIds = new Set(nodes.filter((n) => n.status === "OWNED").map((n) => n.id));

  // marca ativo na barra
  document.querySelectorAll(".elem").forEach((d) => d.classList.toggle("active", d.dataset.el === elId));
  updateDossier(elId);

  // título + variáveis de cor
  const title = $("treeTitle");
  title.textContent = meta.name;
  const wrap = $("canvasWrap");
  const stage = document.querySelector(".stage");
  for (const el of [title, wrap, stage]) {
    if (!el) continue;
    el.style.setProperty("--el", meta.color);
    el.style.setProperty("--elGlow", glow(meta.color));
  }
  if (stage) stage.style.setProperty("--elBg", ELEMENT_BG[elId] || "none");

  const maxRow = nodes.reduce((m, n) => Math.max(m, n.row), 0);
  const height = TOP_PAD + maxRow * ROW_GAP + 110;
  wrap.style.width = WIDTH + "px";
  wrap.style.height = height + "px";

  const pos = (n) => ({ x: CENTER_X + n.col * COL_GAP, y: TOP_PAD + n.row * ROW_GAP });
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  // arestas: curvas bezier (galho ligando pai -> filho)
  const svg = $("edges");
  svg.setAttribute("viewBox", `0 0 ${WIDTH} ${height}`);
  let edges = "";
  for (const n of nodes) {
    const a = pos(n);
    for (const req of n.requires) {
      const p = byId[req];
      if (!p) continue;
      const b = pos(p);
      const on = ownedIds.has(n.id) && ownedIds.has(req) ? " on" : "";
      const my = (b.y + a.y) / 2; // curva vertical suave entre os pontos de controle
      edges += `<path class="edge${on}" d="M${b.x},${b.y} C${b.x},${my} ${a.x},${my} ${a.x},${a.y}"/>`;
    }
  }
  svg.innerHTML = edges;

  // bolinhas
  const cont = $("nodes");
  cont.innerHTML = "";
  for (const n of nodes) {
    const { x, y } = pos(n);
    const div = document.createElement("div");
    const kind = n.kind === "PASSIVE" ? "passive" : "";
    const st = n.status.toLowerCase();
    div.className = `node ${kind} ${st}`;
    div.style.left = x + "px";
    div.style.top = y + "px";
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.setAttribute("aria-label", `${n.name}${n.rank ? " (rank " + n.rank + ")" : ""}`);
    const badge = n.rank ? `<span class="badge r-${n.rank}">${n.rank}</span>` : "";
    const face = n.img
      ? `<img class="emoji-img" src="${n.img}" alt="" loading="lazy">`
      : `<span class="emoji">${n.icon}</span>`;
    div.innerHTML = `${face}${badge}<span class="lbl">${n.name}</span>`;
    div.onclick = () => openModal(n);
    div.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openModal(n); } };
    cont.appendChild(div);
  }
}

// 1 casa do grid ≈ 1,5 m (escala tática usada só p/ exibir alcance no site).
const METERS_PER_CELL = 1.5;
const CAT_LABEL = { NINJUTSU: "Ninjutsu", TAIJUTSU: "Taijutsu", BUKIJUTSU: "Kenjutsu",
  IRYO: "Ninjutsu Médico", GENJUTSU: "Genjutsu", CLA: "Técnica de Clã" };
const ACT_LABEL = { COMUM: "Ação comum", BONUS: "Ação bônus", REACAO: "Reação" };
const RES_LABEL = { chakra: "Chakra", energia: "Energia" };

// Descreve o formato de área + alcance de um jutsu, em metros.
function areaText(c) {
  const raw = c.range * METERS_PER_CELL;
  const m = (Number.isInteger(raw) ? raw : raw.toFixed(1)).toString().replace(".", ",");
  switch (c.shape) {
    case "MELEE": return "Corpo a corpo (adjacente)";
    case "SELF": return "Em si mesmo";
    case "ALLY": return `Aliado · até ${m} m`;
    case "SINGLE_TARGET": return `Alvo único · até ${m} m`;
    case "LINE": return `Linha reta · ${m} m`;
    case "CONE": return `Cone de 90° · ${m} m`;
    case "RADIUS": return `Explosão em área · raio ${m} m`;
    case "GLOBAL_OR_SCENARIO": return "Campo de batalha inteiro";
    default: return `${m} m`;
  }
}

function openModal(n) {
  modalNode = n;
  const mIcon = $("mIcon");
  mIcon.innerHTML = n.img
    ? `<img class="modal-img" src="${n.img}" alt="">`
    : n.icon;
  $("mName").textContent = n.name;
  $("mDesc").innerHTML = highlightEffects(n.desc);
  const rank = $("mRank");
  const kindLabel = n.kind === "ELEMENT" ? "Sorteio de Elemento" : "";
  if (n.rank) { rank.textContent = "Rank " + n.rank; rank.classList.remove("hidden"); }
  else { rank.textContent = kindLabel; rank.classList.toggle("hidden", !kindLabel); }

  const chip = (label, val) => `<span>${label}: <b>${val}</b></span>`;
  let meta = "";
  const c = n.combat;
  if (c) {
    meta += `<span class="meta-h">Em combate</span>`;
    meta += chip("Tipo", CAT_LABEL[c.category] || c.category);
    meta += chip("Ação", ACT_LABEL[c.actionType] || c.actionType);
    meta += chip("Alcance", areaText(c));
    meta += chip(RES_LABEL[c.resource] || c.resource, c.cost + "%");
    if (c.baseDamage) meta += chip("Dano base", c.baseDamage);
    if (c.baseHeal) meta += chip("Cura base", c.baseHeal);
  }
  meta += `<span class="meta-h">Para aprender</span>`;
  meta += chip("Pontos", n.cost);
  meta += chip("Nível", n.reqLevel);
  meta += chip("Ninjutsu", n.reqNinjutsu);
  $("mMeta").innerHTML = meta;

  const reason = $("mReason");
  const buy = $("mBuy");
  if (n.status === "OWNED") {
    reason.textContent = "✓ Você já domina esta técnica.";
    reason.classList.remove("hidden");
    buy.classList.add("hidden");
  } else if (n.status === "BUYABLE") {
    reason.classList.add("hidden");
    buy.classList.remove("hidden");
    buy.disabled = false;
    buy.textContent = `Comprar · ${n.cost} pts`;
  } else {
    reason.textContent = n.reason || "Requisitos não atendidos.";
    reason.classList.remove("hidden");
    buy.classList.remove("hidden");
    buy.disabled = true;
    buy.textContent = "Bloqueado";
  }
  $("modal").classList.remove("hidden");
}

function closeModal() {
  $("modal").classList.add("hidden");
  modalNode = null;
}

async function doBuy() {
  if (!modalNode) return;
  const buy = $("mBuy");
  buy.disabled = true;
  buy.textContent = "Comprando…";
  try {
    const res = await fetch("/api/buy", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: modalNode.id }),
    });
    const out = await res.json();
    if (!out.ok) {
      toast(out.error || "Não foi possível comprar.", true);
      // ressincroniza (estado pode ter mudado)
      state = await fetchState();
      lastSig = sigOf(state);
      updateTop();
      renderTree(activeEl);
      closeModal();
      return;
    }
    const elName = out.grantedElement && ELEMENTS.find((e) => e.id === out.grantedElement)?.name;
    toast(elName ? `Elemento sorteado: ${elName}! 🎴` : `Desbloqueado: ${modalNode.name}!`);
    closeModal();
    // recarrega o estado autoritativo e re-renderiza
    state = await fetchState();
    lastSig = sigOf(state);
    updateTop();
    renderTree(activeEl);
  } catch {
    toast("Erro de rede.", true);
    buy.disabled = false;
  }
}

let toastTimer = null;
function toast(msg, err) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (err ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2600);
}

// listeners
$("mCancel").onclick = closeModal;
$("mBuy").onclick = doBuy;
$("modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };
$("logoutBtn").onclick = async () => {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  location.reload();
};

boot();
