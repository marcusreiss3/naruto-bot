// Blocos visuais dos paineis economicos, em Discord Components V2 (etapa 08).
//
// Regra do modulo: ele monta APARENCIA a partir de dados ja calculados. Nao
// existe aqui preco, saldo, permissao, estoque nem qualquer decisao economica —
// isso continua nos servicos. Se um helper precisasse consultar o banco para
// desenhar, o helper esta errado.
//
// ---------------------------------------------------------------------------
// A restricao que rege tudo
// ---------------------------------------------------------------------------
// Mensagem com `MessageFlags.IsComponentsV2` (32768) NAO pode levar `embeds`
// nem `content` — o Discord rejeita a requisicao inteira. Todo texto vira
// `TextDisplayBuilder`. E a flag e' de mao unica: uma vez enviada, aquela
// mensagem nunca mais volta a ser embed, entao TODA edicao dela precisa
// continuar V2. Por isso os handlers usam `v2Reply()`/`v2Edit()` daqui em vez
// de montar o payload na mao.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  MediaGalleryBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type APIMessageTopLevelComponent,
  type JSONEncodable,
  type MessageActionRowComponentBuilder,
} from "discord.js";
import { emoji, isEmojiKey, itemEmoji, type EmojiKey } from "./economy-emojis.js";

// ---------------- Paleta ----------------

// Paleta pequena e fixa da etapa 08. Handler nao escolhe hex: escolhe contexto.
export const ACCENT = {
  vila: 0x4f7fc9,
  cofre: 0x2f9e62,
  mercado: 0xc9a227,
  estoque: 0x8b5a2b,
  obras: 0xd97706,
  aviso: 0x6b7280,
  erro: 0xc2413b,
} as const;

export type AccentName = keyof typeof ACCENT;

// ---------------- Tipos ----------------

// Filho aceito por um container. A uniao existe para `economyContainer` poder
// receber uma lista heterogenea e despachar por tipo — sem isso, cada painel
// repetiria a sequencia de `addXComponents` na ordem certa.
export type ContainerChild =
  | TextDisplayBuilder
  | SeparatorBuilder
  | SectionBuilder
  | MediaGalleryBuilder
  | ActionRowBuilder<MessageActionRowComponentBuilder>;

export type TopLevel = JSONEncodable<APIMessageTopLevelComponent>;

// ---------------- Container ----------------

export function economyContainer(accent: AccentName, children: ContainerChild[]): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(ACCENT[accent]);
  for (const child of children) {
    if (child instanceof TextDisplayBuilder) container.addTextDisplayComponents(child);
    else if (child instanceof SeparatorBuilder) container.addSeparatorComponents(child);
    else if (child instanceof SectionBuilder) container.addSectionComponents(child);
    else if (child instanceof MediaGalleryBuilder) container.addMediaGalleryComponents(child);
    else container.addActionRowComponents(child);
  }
  return container;
}

// ---------------- Texto ----------------

export function text(markdown: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(markdown);
}

// Titulo do cartao: `# Emoji Titulo` e, opcionalmente, a linha de contexto logo
// abaixo. Vai num TextDisplay so' porque duas linhas coladas leem melhor que
// dois blocos separados por margem.
export function titleBlock(
  emojiKey: EmojiKey | string,
  title: string,
  subtitle?: string,
): TextDisplayBuilder {
  // Chave conhecida vira emoji; qualquer outra string e' emoji literal. A
  // checagem e' de PERTINENCIA ao mapa, nao um padrao de texto: chave como
  // `shop_MERCADO_GERAL` nao casaria com regex de minusculas e vazaria o nome
  // cru para o titulo do painel.
  const icone = isEmojiKey(emojiKey) ? emoji(emojiKey) : emojiKey;
  const cabecalho = `# ${icone} ${title}`;
  return text(subtitle ? `${cabecalho}\n-# ${subtitle}` : cabecalho);
}

// Dados curtos em UMA linha: `**Saldo:** 💴 240 Ryō • **Imposto:** 5%`.
// Preferir isto a campos de embed: a etapa 08 proibe mural de campos vazios.
export interface Fact {
  label: string;
  value: string;
}

export function factsBlock(facts: Fact[]): TextDisplayBuilder {
  return text(facts.map((f) => `**${f.label}:** ${f.value}`).join(" • "));
}

// Lista curta com rotulo opcional. Cada linha ja vem pronta de quem chamou.
export function listBlock(heading: string | null, linhas: string[], vazio: string): TextDisplayBuilder {
  const corpo = linhas.length ? linhas.join("\n") : `-# ${vazio}`;
  return text(heading ? `**${heading}**\n${corpo}` : corpo);
}

// ---------------- Avisos ----------------

export type NoticeKind = "sucesso" | "aviso" | "erro" | "bloqueio";

const NOTICE_EMOJI: Record<NoticeKind, EmojiKey> = {
  sucesso: "sucesso",
  aviso: "aviso",
  erro: "erro",
  bloqueio: "bloqueio",
};

// Faixa de estado. Sempre com TEXTO junto do icone: a etapa 08 proibe depender
// so' de cor para comunicar situacao.
export function noticeBlock(kind: NoticeKind, texto: string): TextDisplayBuilder {
  return text(`${emoji(NOTICE_EMOJI[kind])} ${texto}`);
}

// Recibo da acao anterior. Faixa verde no topo da proxima renderizacao; some
// sozinho quando o painel e' redesenhado sem recibo.
export function receiptBlock(recibo: string): TextDisplayBuilder {
  return text(`${emoji("recibo")} ${recibo}`);
}

// Faixa de retorno da acao anterior, seja ela sucesso ou recusa.
//
// Os handlers ja carregavam a convencao de prefixar a mensagem com ✅/❌; em vez
// de reescrever dezenas de chamadas, o prefixo vira o TIPO da faixa. Sem isso
// um "saldo insuficiente" apareceria com icone de recibo, dizendo ao jogador
// que algo foi movimentado quando nada foi.
export function feedbackBlock(mensagem: string): TextDisplayBuilder {
  const limpo = mensagem.replace(/^[✅❌⚠️]\s*/u, "");
  if (mensagem.startsWith("❌")) return noticeBlock("erro", limpo);
  if (mensagem.startsWith("⚠️")) return noticeBlock("aviso", limpo);
  return receiptBlock(limpo);
}

// ---------------- Divisores ----------------

export function divider(grande = false): SeparatorBuilder {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(grande ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
}

// Respiro sem linha, para separar bloco de acao do texto acima.
export function spacer(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small);
}

// ---------------- Secoes com botao acessorio ----------------

// Texto com um botao ao lado — o "botao dentro do card" da etapa 08.
// Um Section aceita no maximo tres TextDisplay e exige um acessorio.
export function primaryActionSection(texto: string, button: ButtonBuilder): SectionBuilder {
  return new SectionBuilder().addTextDisplayComponents(text(texto)).setButtonAccessory(button);
}

// Texto com uma imagem ao lado — usado quando o item tem aparencia propria
// (marionete, cla) e o painel deve mostrar a fotinho junto do texto.
export function thumbnailSection(markdown: string, url: string, description: string): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(text(markdown))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(url).setDescription(description));
}

/** Imagem de destaque para revelações, como a definição de Clã ou Traço. */
export function mediaGallery(url: string, description: string): MediaGalleryBuilder {
  return new MediaGalleryBuilder().addItems({ media: { url }, description });
}

// ---------------- Botoes e linhas ----------------

export interface ButtonSpec {
  id: string;
  label: string;
  style?: ButtonStyle;
  emojiKey?: EmojiKey;
  disabled?: boolean;
}

export function button(spec: ButtonSpec): ButtonBuilder {
  const b = new ButtonBuilder()
    .setCustomId(spec.id)
    .setLabel(spec.label)
    .setStyle(spec.style ?? ButtonStyle.Secondary)
    .setDisabled(spec.disabled ?? false);
  // `setEmoji` aceita Unicode e `<:nome:id>`: o mesmo valor do modulo de emojis.
  if (spec.emojiKey) b.setEmoji(emoji(spec.emojiKey));
  return b;
}

export function buttonRow(
  ...botoes: ButtonBuilder[]
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...botoes);
}

export function selectRow(
  select: StringSelectMenuBuilder,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);
}

// Navegacao secundaria: tudo `Secondary`, verbo na frente.
export function navigationRow(
  specs: ButtonSpec[],
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return buttonRow(...specs.map((spec) => button({ style: ButtonStyle.Secondary, ...spec })));
}

export function closeRow(
  refreshId: string,
  closeId: string,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return navigationRow([
    { id: refreshId, label: "Atualizar" },
    { id: closeId, label: "Fechar" },
  ]);
}

// ---------------- Itens ----------------

// Rotulo canonico de item: emoji + nome, com quantidade opcional. Handler nao
// concatena emoji na mao em lugar nenhum.
export function itemLabel(itemId: string, name: string, quantity?: number): string {
  const base = `${itemEmoji(itemId)} ${name}`;
  return quantity === undefined ? base : `${base} ×${quantity}`;
}

export function ryo(valor: number | string): string {
  return `${emoji("ryo")} ${valor}`;
}

// ---------------- Payloads ----------------

// UNICO lugar que monta payload V2. Nao aceita `embeds` nem `content` por
// construcao — o tipo simplesmente nao tem esses campos, entao o erro do
// Discord vira erro de compilacao.
export interface V2Payload {
  components: TopLevel[];
  flags: number;
}

export function v2Payload(components: TopLevel[], ephemeral = true): V2Payload {
  return {
    components,
    flags: ephemeral
      ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      : MessageFlags.IsComponentsV2,
  };
}

// Edicao de uma resposta ja deferida/enviada. Sem a flag Ephemeral: a
// visibilidade foi decidida no defer e reenvia-la em `editReply` e' erro.
export function v2Edit(components: TopLevel[]): { components: TopLevel[]; flags: number } {
  return { components, flags: MessageFlags.IsComponentsV2 };
}

// Mensagem PUBLICA num canal (`channel.send`). Anuncio de auditoria continua
// publico por regra; V2 muda so' a aparencia dele.
export function v2Public(components: TopLevel[]): { components: TopLevel[]; flags: number } {
  return { components, flags: MessageFlags.IsComponentsV2 };
}

// Painel de uma tela so': container unico. Atalho do caso mais comum.
export function singleCard(accent: AccentName, children: ContainerChild[]): TopLevel[] {
  return [economyContainer(accent, children)];
}
