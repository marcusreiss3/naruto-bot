import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MediaGalleryBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SectionBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import { existsSync } from "node:fs";
import { prisma } from "../../db/client.js";
import { CLANS } from "../../data/clans/index.js";
import {
  CLANS_BY_VILLAGE,
  COMPLETED_CHANNEL_TTL_MS,
  REGISTERED_ROLE_ID,
  SHEET_CHANNEL_TTL_MS,
  SHEET_LAUNCH_CHANNEL_ID,
  SHEET_LOCATION_ROLES,
  SHEET_VILLAGE_ROLES,
  UNREGISTERED_ROLE_ID,
  clanIconPath,
  clanIconUrl,
  rollClanVillageOptions,
  rollTrait,
  traitIconPath,
  traitIconUrl,
  type ClanVillageRoll,
} from "../../data/sheet-creation.js";
import { getTrait } from "../../data/traits.js";
import { VILLAGE_NAMES, type VillageId } from "../../data/villages.js";
import {
  ALL_TRAVEL_ROLE_IDS,
  TRAVEL_LOCATION_ROLE_IDS,
} from "../../data/travel.js";
import {
  economyContainer,
  divider,
  text,
  v2Edit,
  v2Public,
  type ContainerChild,
  type TopLevel,
} from "../../ui/economy-components-v2.js";
import { getOrCreateCharacter, setCharacterName, setClan } from "../characters/character-service.js";
import { setCharacterTrait } from "../characters/trait-service.js";
import { ENV } from "../../config/env.js";
import { isAdminMember } from "../../utils/permissions.js";
import { log } from "../../utils/logger.js";
import { HAS_GEMINI } from "../../config/env.js";
import {
  claimWithIdentified,
  getAppearance,
  identifyCharacter,
  releaseAppearance,
  type IdentifiedCharacter,
  type MemberPresenceCheck,
} from "../appearance/appearance-service.js";
import { standardizeTypedName } from "../appearance/vision.js";
import { blobAssetUrl } from "../blob/asset-manifest.js";

type Stage =
  | "CLAN_CHOICE"
  | "NAME"
  | "TRAIT_ROLL"
  | "TRAIT_CHOICE"
  | "AGE"
  | "STORY"
  | "APPEARANCE"
  | "APPEARANCE_CONFIRM"
  | "CONFIRM"
  | "FINALIZING"
  | "COMPLETED";

interface SheetData {
  firstSheet: boolean;
  clanOptions: ClanVillageRoll[];
  villageId?: VillageId;
  clanId?: string;
  givenName?: string;
  traitRarity?: string;
  traitOptions?: string[];
  traitId?: string;
  age?: number;
  story?: string;
  appearanceUrl?: string;
  appearanceSourceUrl?: string;
  appearanceCandidate?: IdentifiedCharacter;
}

type Session = Awaited<ReturnType<typeof getSessionByChannel>>;
type PersistedSession = NonNullable<Session>;
const CLAN_INDEX = new Map(CLANS.map((clan) => [clan.id, clan]));
const RARITY_LABEL: Record<string, string> = {
  COMUM: "Comum",
  RARA: "Rara",
  EPICA: "Épica",
  LENDARIA: "Lendária",
  MITICA: "Mítica",
};
const TUTORIAL_MOBILE_GIF = "https://placehold.co/900x500.gif?text=Tutorial+Mobile";
const TUTORIAL_PC_GIF = "https://placehold.co/900x500.gif?text=Tutorial+PC";

function parseData(value: string): SheetData {
  try {
    const parsed = JSON.parse(value) as SheetData;
    return parsed && typeof parsed === "object" ? parsed : { firstSheet: true, clanOptions: [] };
  } catch {
    return { firstSheet: true, clanOptions: [] };
  }
}

function card(children: ContainerChild[], accent: "vila" | "cofre" | "aviso" | "erro" = "vila"): TopLevel[] {
  return [economyContainer(accent, children)];
}

function heading(title: string, subtitle?: string) {
  return text(`# ${title}${subtitle ? `\n-# ${subtitle}` : ""}`);
}

function buttons(...items: ButtonBuilder[]) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...items);
}

function button(id: string, label: string, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

function thumbnailSection(markdown: string, url: string, description: string) {
  return new SectionBuilder()
    .addTextDisplayComponents(text(markdown))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(url).setDescription(description));
}

function media(url: string, description: string) {
  return new MediaGalleryBuilder().addItems({ media: { url }, description });
}

function attachmentOrBlob(
  localPath: string,
  webPath: string,
  filename: string,
  files: AttachmentBuilder[],
): string {
  if (existsSync(localPath)) {
    files.push(new AttachmentBuilder(localPath, { name: filename }));
    return `attachment://${filename}`;
  }
  const cdnUrl = blobAssetUrl(webPath);
  if (cdnUrl) return cdnUrl;
  throw new Error(`Asset ausente localmente e no manifesto Blob: ${webPath}`);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function cleanChannelName(username: string, userId: string): string {
  const clean = username
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "ninja";
  return `ficha-${clean}-${userId.slice(-4)}`;
}

export async function getSessionByChannel(channelId: string) {
  return prisma.sheetCreationSession.findUnique({ where: { channelId } });
}

async function updateSession(sessionId: string, stage: Stage, data: SheetData) {
  return prisma.sheetCreationSession.update({
    where: { id: sessionId },
    data: { stage, dataJson: JSON.stringify(data) },
  });
}

async function transitionSession(
  sessionId: string,
  from: Stage,
  to: Stage,
  data: SheetData,
): Promise<boolean> {
  const changed = await prisma.sheetCreationSession.updateMany({
    where: { id: sessionId, stage: from },
    data: { stage: to, dataJson: JSON.stringify(data) },
  });
  return changed.count === 1;
}

async function resolveTextChannel(client: Client, channelId: string | null | undefined): Promise<TextChannel | null> {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.type === ChannelType.GuildText ? channel : null;
}

export interface OpenSheetResult {
  status: "CREATED" | "RESUMED" | "EXISTING" | "COMPLETED";
  channelId?: string;
}

async function createPrivateSheetChannel(guild: Guild, member: GuildMember): Promise<TextChannel> {
  const launcher = await guild.channels.fetch(SHEET_LAUNCH_CHANNEL_ID).catch(() => null);
  if (!launcher || launcher.type !== ChannelType.GuildText) {
    throw new Error("O canal de criação de ficha não foi encontrado.");
  }

  const me = guild.members.me ?? await guild.members.fetchMe();
  return guild.channels.create({
    name: cleanChannelName(member.user.username, member.id),
    type: ChannelType.GuildText,
    parent: launcher.parentId ?? undefined,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      ...ENV.ADMIN_ROLE_IDS.map((id) => ({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      })),
    ],
    reason: `Criação de ficha de ${member.user.tag}`,
  });
}

async function sendSheetIntroduction(channel: TextChannel, memberId: string, resumed: boolean) {
  await channel.send(v2Public(card([
    heading(resumed ? "Ficha retomada" : "Criação de ficha", "Este canal é privado e ficará ativo por uma hora"),
    text(`<@${memberId}>, responda somente ao que for pedido em cada etapa.`),
    divider(),
    text(resumed
      ? "Seu progresso anterior foi recuperado. A ficha continuará exatamente da etapa em que parou."
      : "O primeiro sorteio combina uma vila de origem com um clã pertencente a ela. Sua primeira ficha recebe três opções."),
    text("-# Se este canal expirar ou for apagado, use /ficha novamente. O bot abrirá outro canal sem trocar sua origem nem apagar o progresso."),
  ])));
}

export async function openSheetChannel(guild: Guild, member: GuildMember): Promise<OpenSheetResult> {
  const character = await prisma.userCharacter.findUnique({
    where: { discordId_guildId: { discordId: member.id, guildId: guild.id } },
    include: { profile: true },
  });
  if (character?.profile?.completedAt) return { status: "COMPLETED" };

  let existing = await prisma.sheetCreationSession.findUnique({
    where: { guildId_discordId: { guildId: guild.id, discordId: member.id } },
  });
  if (existing) {
    if (existing.stage === "COMPLETED") return { status: "COMPLETED" };
    const channel = await resolveTextChannel(guild.client, existing.channelId);
    if (channel) return { status: "EXISTING", channelId: channel.id };
    await prisma.sheetCreationSession.update({
      where: { id: existing.id },
      data: { channelId: null, channelExpiresAt: null },
    });
    if (existing.stage === "CLAN_CHOICE" && existing.clanChoiceExpiresAt) {
      existing = await prisma.sheetCreationSession.update({
        where: { id: existing.id },
        data: { clanChoiceExpiresAt: null },
      });
    }
  }

  const channel = await createPrivateSheetChannel(guild, member);

  if (existing) {
    const attached = await prisma.sheetCreationSession.updateMany({
      where: { id: existing.id, channelId: null },
      data: {
        channelId: channel.id,
        channelExpiresAt: new Date(Date.now() + SHEET_CHANNEL_TTL_MS),
      },
    });
    if (attached.count !== 1) {
      await channel.delete("Outra retomada de ficha já criou um canal").catch(() => undefined);
      const latest = await prisma.sheetCreationSession.findUnique({ where: { id: existing.id } });
      return { status: "EXISTING", channelId: latest?.channelId ?? undefined };
    }
    const resumed = await prisma.sheetCreationSession.findUnique({ where: { id: existing.id } });
    if (!resumed) throw new Error("O rascunho da ficha não pôde ser recuperado.");
    await sendSheetIntroduction(channel, member.id, true);
    await resumeSheet(channel, resumed);
    await armSheetScheduler(guild.client);
    return { status: "RESUMED", channelId: channel.id };
  }

  const firstSheet = !character?.profile?.completedAt;
  const clanOptions = rollClanVillageOptions(firstSheet ? 3 : 1);
  let session;
  try {
    session = await prisma.sheetCreationSession.create({
      data: {
        guildId: guild.id,
        discordId: member.id,
        channelId: channel.id,
        stage: "CLAN_CHOICE",
        dataJson: JSON.stringify({ firstSheet, clanOptions } satisfies SheetData),
        channelExpiresAt: new Date(Date.now() + SHEET_CHANNEL_TTL_MS),
        clanChoiceExpiresAt: null,
      },
    });
  } catch (error) {
    await channel.delete("Falha ao abrir sessão de ficha").catch(() => undefined);
    throw error;
  }

  await sendSheetIntroduction(channel, member.id, false);
  await runClanAnimation(channel, session.id, clanOptions);
  await armSheetScheduler(guild.client);
  return { status: "CREATED", channelId: channel.id };
}

async function runClanAnimation(
  channel: TextChannel,
  sessionId: string,
  options: ClanVillageRoll[],
) {
  const frames = [
    ["Consultando registros das cinco nações", "[■□□□□]"],
    ["Comparando linhagens disponíveis", "[■■□□□]"],
    ["Vinculando território e ancestralidade", "[■■■□□]"],
    ["Selando as possibilidades", "[■■■■□]"],
    ["Sorteio concluído", "[■■■■■]"],
  ] as const;
  const message = await channel.send(v2Public(card([
    heading("Sorteio de origem"),
    text(`${frames[0][0]}\n${frames[0][1]}`),
  ])));
  for (const [label, progress] of frames.slice(1)) {
    await wait(600);
    await message.edit(v2Edit(card([heading("Sorteio de origem"), text(`${label}\n${progress}`)])));
  }

  const files: AttachmentBuilder[] = [];
  const sections: SectionBuilder[] = [];
  for (const [index, option] of options.entries()) {
    const clan = CLAN_INDEX.get(option.clanId)!;
    const filename = `cla-${index + 1}.${clanIconPath(clan.id).split(".").pop()}`;
    const iconUrl = attachmentOrBlob(clanIconPath(clan.id), clanIconUrl(clan.id), filename, files);
    sections.push(thumbnailSection(
      `**Opção ${index + 1}: ${VILLAGE_NAMES[option.villageId]} — Clã ${clan.name}**\n${clan.description}`,
      iconUrl,
      `Símbolo do Clã ${clan.name}`,
    ));
  }
  await message.edit({
    ...v2Edit(card([
      heading("Escolha sua origem", "Vila e clã permanecem vinculados"),
      text("Estas são as possibilidades registradas para sua ficha."),
      text("-# As três opções foram registradas e continuarão as mesmas até você escolher uma delas."),
      divider(),
      ...sections,
      divider(),
      buttons(...options.map((_, index) => button(`ficha:v1:clan:${sessionId}:${index}`, `Escolher opção ${index + 1}`))),
    ])),
    files,
  });
}

async function promptName(channel: TextChannel, data: SheetData) {
  const clan = CLAN_INDEX.get(data.clanId!)!;
  await channel.send(v2Public(card([
    heading("Nome do personagem", `${VILLAGE_NAMES[data.villageId!]} — Clã ${clan.name}`),
    text("⚠️ **DIGITE SOMENTE O PRIMEIRO NOME. NÃO coloque sobrenome, clã ou título.**"),
    divider(),
    text(`O sobrenome **${clan.name}** será adicionado automaticamente.\nDigite, por exemplo, \`Marcus\` — a ficha ficará \`Marcus ${clan.name}\`.`),
    text("-# São aceitas apenas letras, espaços, hífen e apóstrofo; de 2 a 24 caracteres."),
  ])));
}

async function runTraitAnimation(channel: TextChannel, sessionId: string, data: SheetData) {
  const result = rollTrait();
  data.traitRarity = result.rarity;
  data.traitOptions = result.options.map((trait) => trait.id);
  data.traitId = result.rarity === "MITICA" ? undefined : result.options[0]!.id;
  await updateSession(sessionId, result.rarity === "MITICA" ? "TRAIT_CHOICE" : "AGE", data);

  const scan = ["Comum", "Rara", "Épica", "Lendária", "Mítica", "Analisando assinatura final"];
  const message = await channel.send(v2Public(card([
    heading("Sorteio de traço"),
    text("As probabilidades estão sendo verificadas."),
  ])));
  for (let index = 0; index < scan.length; index += 1) {
    await wait(500);
    const marks = "■".repeat(index + 1) + "□".repeat(scan.length - index - 1);
    await message.edit(v2Edit(card([
      heading("Sorteio de traço"),
      text(`Faixa em análise: **${scan[index]}**\n[${marks}]`),
      text("-# Comum 47,5% · Rara 30% · Épica 15% · Lendária 7% · Mítica 0,5%"),
    ])));
  }

  const files: AttachmentBuilder[] = [];
  const sections: SectionBuilder[] = [];
  for (const [index, trait] of result.options.entries()) {
    const filename = `traco-${index + 1}.png`;
    const iconUrl = attachmentOrBlob(traitIconPath(trait), traitIconUrl(trait), filename, files);
    sections.push(thumbnailSection(
      `**${trait.name}**\nFaixa: **${RARITY_LABEL[trait.rarity]}**\n${trait.description}`,
      iconUrl,
      `Imagem do traço ${trait.name}`,
    ));
  }
  const children: ContainerChild[] = [
    heading(result.rarity === "MITICA" ? "Uma assinatura mítica foi encontrada" : "Traço definido"),
    text(`Resultado da faixa: **${RARITY_LABEL[result.rarity]}**.`),
    divider(),
    ...sections,
  ];
  if (result.rarity === "MITICA") {
    children.push(
      divider(),
      text("A faixa mítica permite escolher um dos três traços."),
      buttons(...result.options.map((_, index) => button(`ficha:v1:trait:${sessionId}:${index}`, `Escolher traço ${index + 1}`))),
    );
  } else {
    children.push(divider(), ageInstruction(data));
  }
  await message.edit({ ...v2Edit(card(children, result.rarity === "MITICA" ? "cofre" : "vila")), files });
}

async function showSavedTraitChoice(channel: TextChannel, sessionId: string, data: SheetData) {
  const traits = (data.traitOptions ?? [])
    .map((id) => getTrait(id))
    .filter((trait): trait is NonNullable<typeof trait> => trait?.rarity === "MITICA");
  if (!traits.length) throw new Error(`Ficha ${sessionId} não possui opções míticas válidas salvas.`);

  const files: AttachmentBuilder[] = [];
  const sections: SectionBuilder[] = [];
  for (const [index, trait] of traits.entries()) {
    const filename = `traco-retomado-${index + 1}.png`;
    const iconUrl = attachmentOrBlob(traitIconPath(trait), traitIconUrl(trait), filename, files);
    sections.push(thumbnailSection(
      `**${trait.name}**\nFaixa: **${RARITY_LABEL[trait.rarity]}**\n${trait.description}`,
      iconUrl,
      `Imagem do traço ${trait.name}`,
    ));
  }
  await channel.send({
    ...v2Public(card([
      heading("Escolha seu traço mítico", "Opções recuperadas do seu rascunho"),
      ...sections,
      divider(),
      buttons(...traits.map((_, index) => button(`ficha:v1:trait:${sessionId}:${index}`, `Escolher traço ${index + 1}`))),
    ], "cofre")),
    files,
  });
}

function ageInstruction(data: SheetData) {
  const prodigy = data.traitId === "trait_prodigio";
  const minimum = prodigy ? 9 : 11;
  return text(`## Idade do personagem\nDigite somente um número inteiro entre **${minimum} e 13**.`);
}

async function promptAge(channel: TextChannel, data: SheetData) {
  await channel.send(v2Public(card([heading("Idade do personagem"), ageInstruction(data)])));
}

async function promptStory(channel: TextChannel) {
  await channel.send(v2Public(card([
    heading("História do personagem"),
    text("Conte a origem, personalidade, objetivos e acontecimentos importantes do seu ninja em uma única mensagem."),
    divider(),
    text("O texto deve ter entre **10 e 1.800 caracteres**."),
  ])));
}

async function promptAppearance(channel: TextChannel) {
  await channel.send(v2Public(card([
    heading("Aparência do personagem"),
    text("Envie uma imagem anexada ou cole um link direto. A IA verificará se é uma aparência válida, identificará o personagem e bloqueará personagens/OCs já em uso."),
    divider(),
    text("Depois da sua confirmação, a imagem ficará guardada no Blob por 3 meses. O personagem ficará reservado por até 6 meses."),
    text("Formatos usuais: PNG, JPEG, JPG, GIF e WEBP. O link precisa começar com `https://` ou `http://`."),
    text("-# Se o envio não for reconhecido, o painel mostrará tutoriais para celular e computador."),
  ])));
}

function presenceChecker(guild: Guild): MemberPresenceCheck {
  return async (discordId) => {
    try {
      await guild.members.fetch(discordId);
      return true;
    } catch {
      return false;
    }
  };
}

async function sendAppearanceIdentification(channel: TextChannel, sessionId: string, data: SheetData) {
  const candidate = data.appearanceCandidate;
  const sourceUrl = data.appearanceSourceUrl;
  if (!candidate || !sourceUrl) {
    await promptAppearance(channel);
    return;
  }
  const description = candidate.isOc
    ? "A IA não reconheceu um personagem canônico com segurança. Confirme se esta é sua **OC** ou corrija o nome."
    : `A IA identificou **${candidate.name}** (${(candidate.confidence * 100).toFixed(0)}% de certeza). Confirme ou corrija o nome.`;
  await channel.send(v2Public(card([
    heading("Confirme a aparência"),
    media(sourceUrl, "Imagem enviada para a aparência"),
    text(description),
    divider(),
    buttons(
      button(`ficha:v1:appearance:${sessionId}:confirm`, candidate.isOc ? "Confirmar OC" : "Confirmar aparência", ButtonStyle.Success),
      button(`ficha:v1:appearance:${sessionId}:correct`, "Corrigir personagem", ButtonStyle.Secondary),
    ),
  ], "cofre")));
}

async function claimSheetAppearance(
  guild: Guild,
  discordId: string,
  session: PersistedSession,
  data: SheetData,
): Promise<{ ok: true; data: SheetData } | { ok: false; message: string }> {
  if (!data.appearanceCandidate || !data.appearanceSourceUrl) {
    return { ok: false, message: "Envie a imagem novamente para continuar." };
  }
  const result = await claimWithIdentified(
    discordId,
    guild.id,
    data.appearanceSourceUrl,
    data.appearanceCandidate,
    presenceChecker(guild),
  );
  if (result.status === "TAKEN") {
    return { ok: false, message: `🚫 **${result.characterName}** já está em uso por <@${result.holderId}>. Escolha outra aparência.` };
  }
  if (result.status === "STORAGE_UNAVAILABLE") {
    return { ok: false, message: "❌ Não foi possível salvar a imagem no Blob. Tente novamente em alguns instantes." };
  }
  if (result.status !== "OK") return { ok: false, message: "❌ Não foi possível reservar essa aparência agora." };
  const saved = await getAppearance(discordId, guild.id);
  if (!saved) return { ok: false, message: "❌ A aparência não pôde ser recuperada após o salvamento." };
  data.appearanceUrl = saved.imageUrl;
  data.appearanceCandidate = undefined;
  data.appearanceSourceUrl = undefined;
  if (!await transitionSession(session.id, "APPEARANCE_CONFIRM", "CONFIRM", data)) {
    return { ok: false, message: "Esta aparência já foi confirmada em outro painel." };
  }
  return { ok: true, data };
}

async function resumeSheet(channel: TextChannel, session: PersistedSession): Promise<void> {
  const data = parseData(session.dataJson);
  switch (session.stage as Stage) {
    case "CLAN_CHOICE":
      await runClanAnimation(channel, session.id, data.clanOptions);
      return;
    case "NAME":
      await promptName(channel, data);
      return;
    case "TRAIT_ROLL":
      await runTraitAnimation(channel, session.id, data);
      return;
    case "TRAIT_CHOICE":
      await showSavedTraitChoice(channel, session.id, data);
      return;
    case "AGE":
      await promptAge(channel, data);
      return;
    case "STORY":
      await promptStory(channel);
      return;
    case "APPEARANCE":
      await promptAppearance(channel);
      return;
    case "APPEARANCE_CONFIRM":
      await sendAppearanceIdentification(channel, session.id, data);
      return;
    case "CONFIRM":
      await sendAppearancePreview(channel, session.id, data);
      return;
    case "FINALIZING": {
      const restored = await transitionSession(session.id, "FINALIZING", "CONFIRM", data);
      if (restored) await sendAppearancePreview(channel, session.id, data);
      return;
    }
    case "COMPLETED":
      return;
  }
}

function validImageFromMessage(message: Message): string | null {
  const attachment = message.attachments.find((item) =>
    item.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)(?:$|\?)/i.test(item.url),
  );
  if (attachment) return attachment.url;
  const candidate = message.content.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol)) return null;
    return /\.(png|jpe?g|gif|webp)$/i.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
}

async function sendImageTutorialChoice(channel: TextChannel, sessionId: string) {
  await channel.send(v2Public(card([
    heading("Imagem não reconhecida"),
    text("Não encontrei um anexo de imagem nem um link direto com formato válido."),
    divider(),
    text("Escolha onde você está usando o Discord para abrir o tutorial correspondente."),
    buttons(
      button(`ficha:v1:tutorial:${sessionId}:mobile`, "Tutorial para celular", ButtonStyle.Secondary),
      button(`ficha:v1:tutorial:${sessionId}:pc`, "Tutorial para computador", ButtonStyle.Secondary),
    ),
  ], "erro")));
}

async function sendAppearancePreview(channel: TextChannel, sessionId: string, data: SheetData) {
  const clan = CLAN_INDEX.get(data.clanId!)!;
  const trait = getTrait(data.traitId!)!;
  await channel.send(v2Public(card([
    heading("Confirme sua ficha", `${data.givenName} ${clan.name}`),
    media(data.appearanceUrl!, `Aparência de ${data.givenName} ${clan.name}`),
    divider(),
    text(
      `**Vila:** ${VILLAGE_NAMES[data.villageId!]}\n` +
      `**Clã:** ${clan.name}\n` +
      `**Traço:** ${trait.name} — ${RARITY_LABEL[trait.rarity]}\n` +
      `**Idade:** ${data.age} anos\n` +
      `**História:** ${data.story}`,
    ),
    divider(),
    buttons(
      button(`ficha:v1:confirm:${sessionId}:yes`, "Concluir ficha", ButtonStyle.Success),
      button(`ficha:v1:confirm:${sessionId}:image`, "Trocar imagem", ButtonStyle.Secondary),
    ),
    text("-# Ao concluir, seus cargos de registro, vila e localização serão atualizados."),
  ], "cofre")));
}

function nameValidation(raw: string, clanId: string): string | null {
  const clean = raw.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 24) return null;
  if (!/^[\p{L}][\p{L}' -]*$/u.test(clean)) return null;
  const clanNames = CLANS.map((clan) => clan.name.toLocaleLowerCase("pt-BR"));
  const words = clean.toLocaleLowerCase("pt-BR").split(" ");
  if (words.some((word) => clanNames.includes(word))) return null;
  if (clean.toLocaleLowerCase("pt-BR").includes(CLAN_INDEX.get(clanId)!.name.toLocaleLowerCase("pt-BR"))) return null;
  return clean;
}

async function sendInputError(channel: TextChannel, title: string, description: string) {
  await channel.send(v2Public(card([heading(title), text(description)], "erro")));
}

export function sheetMessagePolicy(
  authorId: string,
  ownerId: string,
  authorIsAdmin: boolean,
): "PROCESS" | "IGNORE" | "DELETE" {
  if (authorId === ownerId) return "PROCESS";
  return authorIsAdmin ? "IGNORE" : "DELETE";
}

export async function handleSheetMessage(message: Message): Promise<boolean> {
  if (!message.guild || message.author.bot) return false;
  const session = await getSessionByChannel(message.channelId);
  if (!session) return false;

  const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
  const policy = sheetMessagePolicy(message.author.id, session.discordId, isAdminMember(member));
  if (policy === "IGNORE") return true;
  if (policy === "DELETE") {
    await message.delete().catch(() => undefined);
    return true;
  }
  if (message.channel.type !== ChannelType.GuildText) return true;
  const channel = message.channel;
  const data = parseData(session.dataJson);

  if (session.stage === "NAME") {
    const name = nameValidation(message.content, data.clanId!);
    if (!name) {
      await sendInputError(channel, "Nome inválido", "Digite apenas o nome próprio, usando de 2 a 24 caracteres e sem o sobrenome de nenhum clã.");
      return true;
    }
    data.givenName = name;
    if (!await transitionSession(session.id, "NAME", "TRAIT_ROLL", data)) return true;
    await runTraitAnimation(channel, session.id, data);
    return true;
  }

  if (session.stage === "AGE") {
    const raw = message.content.trim();
    if (!/^\d+$/.test(raw)) {
      await sendInputError(channel, "Idade inválida", "Digite somente o número da idade, sem palavras, sinais ou casas decimais.");
      return true;
    }
    const age = Number(raw);
    const minimum = data.traitId === "trait_prodigio" ? 9 : 11;
    if (!Number.isSafeInteger(age) || age < minimum || age > 13) {
      await sendInputError(channel, "Idade fora do intervalo", `A idade permitida para este personagem é de ${minimum} a 13 anos.`);
      return true;
    }
    data.age = age;
    if (!await transitionSession(session.id, "AGE", "STORY", data)) return true;
    await promptStory(channel);
    return true;
  }

  if (session.stage === "STORY") {
    const story = message.content.trim();
    if (story.length < 10 || story.length > 1_800) {
      await sendInputError(channel, "História inválida", "Envie a história em uma única mensagem, usando entre 10 e 1.800 caracteres.");
      return true;
    }
    data.story = story;
    if (!await transitionSession(session.id, "STORY", "APPEARANCE", data)) return true;
    await promptAppearance(channel);
    return true;
  }

  if (session.stage === "APPEARANCE") {
    const imageUrl = validImageFromMessage(message);
    if (!imageUrl) {
      await sendImageTutorialChoice(channel, session.id);
      return true;
    }
    if (!HAS_GEMINI) {
      await sendInputError(channel, "Sistema de aparência indisponível", "A verificação por IA está offline. Tente novamente mais tarde.");
      return true;
    }
    await channel.send(v2Public(card([heading("Verificando aparência"), text("A IA está analisando a imagem e conferindo a disponibilidade do personagem.")])));
    let identification: Awaited<ReturnType<typeof identifyCharacter>>;
    try {
      identification = await identifyCharacter(imageUrl);
    } catch (error) {
      log.error("Falha ao identificar aparência da ficha:", error);
      await sendInputError(channel, "Falha na análise", "Não consegui analisar essa imagem agora. Tente novamente em alguns instantes.");
      return true;
    }
    if (identification.kind === "NOT_DRAWING") {
      await sendInputError(channel, "Aparência recusada", "Envie desenho/anime/mangá; fotos de pessoas reais não são aceitas.");
      return true;
    }
    if (identification.kind === "INVALID_APPEARANCE") {
      await sendInputError(channel, "Aparência recusada", "Envie um personagem humano/humanoide de anime ou mangá. Animais, mascotes e criaturas não são aceitos.");
      return true;
    }
    if (identification.kind === "NO_SUBJECT") {
      await sendInputError(channel, "Imagem sem personagem", "Não encontrei um personagem nessa imagem. Envie outra mais nítida.");
      return true;
    }
    if (identification.kind === "VISION_OFFLINE") {
      await sendInputError(channel, "Sistema de aparência indisponível", "A IA está offline por enquanto. Tente novamente mais tarde.");
      return true;
    }
    data.appearanceSourceUrl = imageUrl;
    data.appearanceCandidate = identification.result;
    if (!await transitionSession(session.id, "APPEARANCE", "APPEARANCE_CONFIRM", data)) return true;
    await sendAppearanceIdentification(channel, session.id, data);
    return true;
  }

  await sendInputError(channel, "Esta etapa usa os botões", "Use os botões do painel mais recente para continuar a criação da ficha.");
  return true;
}

function requireOwner(interaction: ButtonInteraction, session: NonNullable<Session>) {
  if (interaction.user.id !== session.discordId) throw new Error("Este painel pertence a outro jogador.");
}

function completeData(data: SheetData): data is Required<Omit<SheetData, "traitOptions" | "traitRarity">> & SheetData {
  return Boolean(
    data.villageId && data.clanId && data.givenName && data.traitId &&
    data.age && data.story && data.appearanceUrl,
  );
}

async function addRole(member: GuildMember, roleId: string, reason: string) {
  if (!member.roles.cache.has(roleId)) await member.roles.add(roleId, reason);
}

async function removeRole(member: GuildMember, roleId: string, reason: string) {
  if (member.roles.cache.has(roleId)) await member.roles.remove(roleId, reason);
}

async function finalizeSheet(interaction: ButtonInteraction, session: NonNullable<Session>, data: SheetData) {
  if (!interaction.guild || !completeData(data)) throw new Error("A ficha ainda possui campos incompletos.");
  const clan = CLAN_INDEX.get(data.clanId);
  const trait = getTrait(data.traitId);
  if (!clan || !trait) throw new Error("Clã ou traço inválido na ficha.");

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const char = await getOrCreateCharacter(member.id, interaction.guild.id, member.user.username);
  await prisma.characterProfile.upsert({
    where: { charId: char.id },
    create: {
      charId: char.id,
      givenName: data.givenName,
      age: data.age,
      story: data.story,
      appearanceUrl: data.appearanceUrl,
    },
    update: {
      givenName: data.givenName,
      age: data.age,
      story: data.story,
      appearanceUrl: data.appearanceUrl,
      completedAt: null,
    },
  });
  await setCharacterName(member.id, interaction.guild.id, `${data.givenName} ${clan.name}`);
  await prisma.userCharacter.update({ where: { id: char.id }, data: { villageId: data.villageId } });
  await setClan(char.id, clan.id);
  await setCharacterTrait(char.id, trait.id);

  const villageRole = SHEET_VILLAGE_ROLES[data.villageId];
  const locationRole = SHEET_LOCATION_ROLES[data.villageId];
  const reason = "Conclusão da ficha de personagem";
  // Operacoes individuais usam os endpoints add/delete de cargo do Discord e
  // nao sobrescrevem a lista inteira com uma cache possivelmente atrasada.
  await addRole(member, REGISTERED_ROLE_ID, reason);
  await addRole(member, villageRole, reason);
  await addRole(member, locationRole, reason);
  await removeRole(member, UNREGISTERED_ROLE_ID, reason);
  for (const roleId of Object.values(SHEET_VILLAGE_ROLES)) {
    if (roleId !== villageRole) await removeRole(member, roleId, reason);
  }
  for (const roleId of new Set([...TRAVEL_LOCATION_ROLE_IDS, ...ALL_TRAVEL_ROLE_IDS])) {
    if (roleId !== locationRole) await removeRole(member, roleId, reason);
  }

  await prisma.characterProfile.update({ where: { charId: char.id }, data: { completedAt: new Date() } });
  await prisma.sheetCreationSession.update({
    where: { id: session.id },
    data: {
      stage: "COMPLETED",
      dataJson: JSON.stringify(data),
      channelExpiresAt: new Date(Date.now() + COMPLETED_CHANNEL_TTL_MS),
      clanChoiceExpiresAt: null,
    },
  });
  await armSheetScheduler(interaction.client);

  await interaction.editReply(v2Edit(card([
    heading("Ficha concluída", `${data.givenName} ${clan.name}`),
    text("Seu personagem foi registrado com sucesso."),
    divider(),
    text(
      `**Vila:** ${VILLAGE_NAMES[data.villageId]}\n` +
      `**Clã:** ${clan.name}\n` +
      `**Traço:** ${trait.name}\n` +
      `**Idade:** ${data.age} anos`,
    ),
    divider(),
    text("Os cargos de registro, vila e localização já foram aplicados. Este canal será excluído em 30 segundos."),
  ], "cofre")));
}

export async function handleSheetButton(interaction: ButtonInteraction): Promise<void> {
  const [command, version, action, sessionId, rawValue] = interaction.customId.split(":");
  if (command !== "ficha" || version !== "v1" || !sessionId) return;
  const session = await prisma.sheetCreationSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    await interaction.reply({ content: "Este painel expirou.", flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    requireOwner(interaction, session);
  } catch (error) {
    await interaction.reply({ content: String(error instanceof Error ? error.message : error), flags: MessageFlags.Ephemeral });
    return;
  }
  const data = parseData(session.dataJson);

  if (action === "clan") {
    if (session.stage !== "CLAN_CHOICE") {
      await interaction.reply({ content: "Esta escolha já foi encerrada.", flags: MessageFlags.Ephemeral });
      return;
    }
    const index = Number(rawValue);
    const option = Number.isInteger(index) ? data.clanOptions[index] : undefined;
    if (!option || !CLANS_BY_VILLAGE[option.villageId].includes(option.clanId)) {
      await interaction.reply({ content: "Opção de clã inválida.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();
    data.villageId = option.villageId;
    data.clanId = option.clanId;
    const changed = await prisma.sheetCreationSession.updateMany({
      where: {
        id: session.id,
        stage: "CLAN_CHOICE",
      },
      data: {
        stage: "NAME",
        dataJson: JSON.stringify(data),
        clanChoiceExpiresAt: null,
      },
    });
    if (changed.count !== 1) {
      await interaction.editReply(v2Edit(card([heading("Escolha já encerrada"), text("Continue pelo painel mais recente.")], "aviso")));
      return;
    }
    await interaction.editReply(v2Edit(card([
      heading("Origem escolhida"),
      text(`**${VILLAGE_NAMES[option.villageId]} — Clã ${CLAN_INDEX.get(option.clanId)!.name}**`),
      text("A escolha foi registrada. Continue no painel abaixo."),
    ], "cofre")));
    const channel = await resolveTextChannel(interaction.client, session.channelId);
    if (channel) await promptName(channel, data);
    return;
  }

  if (action === "trait") {
    if (session.stage !== "TRAIT_CHOICE" || data.traitRarity !== "MITICA") {
      await interaction.reply({ content: "Esta escolha já foi encerrada.", flags: MessageFlags.Ephemeral });
      return;
    }
    const index = Number(rawValue);
    const traitId = Number.isInteger(index) ? data.traitOptions?.[index] : undefined;
    const trait = traitId ? getTrait(traitId) : null;
    if (!trait || trait.rarity !== "MITICA") {
      await interaction.reply({ content: "Opção mítica inválida.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();
    data.traitId = trait.id;
    if (!await transitionSession(session.id, "TRAIT_CHOICE", "AGE", data)) {
      await interaction.editReply(v2Edit(card([heading("Escolha já encerrada"), text("Continue pelo painel mais recente.")], "aviso")));
      return;
    }
    await interaction.editReply(v2Edit(card([
      heading("Traço escolhido"),
      text(`**${trait.name}**\n${trait.description}`),
    ], "cofre")));
    const channel = await resolveTextChannel(interaction.client, session.channelId);
    if (channel) await promptAge(channel, data);
    return;
  }

  if (action === "appearance") {
    if (session.stage !== "APPEARANCE_CONFIRM" || !interaction.guild) {
      await interaction.reply({ content: "Esta confirmação de aparência não está mais disponível.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (rawValue === "correct") {
      const modal = new ModalBuilder().setCustomId(`ficha:appearance:${session.id}`).setTitle("Corrigir personagem");
      const input = new TextInputBuilder()
        .setCustomId("nome")
        .setLabel("Personagem ou OC (OC = personagem original)")
        .setPlaceholder("Ex.: Luffy (One Piece) ou OC")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
    if (rawValue !== "confirm") return;
    await interaction.deferUpdate();
    const claimed = await claimSheetAppearance(interaction.guild, interaction.user.id, session, data);
    if (!claimed.ok) {
      await interaction.editReply(v2Edit(card([heading("Aparência não confirmada"), text(claimed.message)], "erro")));
      return;
    }
    await interaction.editReply(v2Edit(card([heading("Aparência confirmada"), text("A imagem foi salva e a reserva do personagem foi registrada.")], "cofre")));
    const channel = await resolveTextChannel(interaction.client, session.channelId);
    if (channel) await sendAppearancePreview(channel, session.id, claimed.data);
    return;
  }

  if (action === "tutorial") {
    if (session.stage !== "APPEARANCE") {
      await interaction.reply({ content: "O tutorial não é necessário nesta etapa.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferUpdate();
    const mobile = rawValue === "mobile";
    await interaction.editReply(v2Edit(card([
      heading(mobile ? "Tutorial para celular" : "Tutorial para computador"),
      media(mobile ? TUTORIAL_MOBILE_GIF : TUTORIAL_PC_GIF, mobile ? "Tutorial para celular" : "Tutorial para computador"),
      divider(),
      text("Este GIF é temporário. Depois de assistir, envie novamente a imagem ou o link direto neste canal."),
      buttons(
        button(`ficha:v1:tutorial:${session.id}:mobile`, "Tutorial para celular", ButtonStyle.Secondary),
        button(`ficha:v1:tutorial:${session.id}:pc`, "Tutorial para computador", ButtonStyle.Secondary),
      ),
    ], "aviso")));
    return;
  }

  if (action === "confirm") {
    if (session.stage !== "CONFIRM") {
      await interaction.reply({ content: "Esta confirmação não está mais disponível.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (rawValue === "image") {
      await interaction.deferUpdate();
      if (interaction.guild) await releaseAppearance(session.discordId, interaction.guild.id);
      data.appearanceUrl = undefined;
      data.appearanceCandidate = undefined;
      data.appearanceSourceUrl = undefined;
      if (!await transitionSession(session.id, "CONFIRM", "APPEARANCE", data)) return;
      await interaction.editReply(v2Edit(card([
        heading("Trocar aparência"),
        text("Envie a nova imagem anexada ou cole um link direto neste canal."),
      ], "aviso")));
      return;
    }
    if (rawValue !== "yes") return;
    await interaction.deferUpdate();
    if (!await transitionSession(session.id, "CONFIRM", "FINALIZING", data)) {
      await interaction.editReply(v2Edit(card([heading("Finalização já iniciada"), text("Aguarde a conclusão da ficha.")], "aviso")));
      return;
    }
    try {
      await finalizeSheet(interaction, session, data);
    } catch (error) {
      log.error("Falha ao concluir ficha:", error);
      await updateSession(session.id, "CONFIRM", data);
      await interaction.editReply(v2Edit(card([
        heading("Não foi possível concluir a ficha"),
        text("Os dados foram preservados. Tente confirmar novamente; se continuar, peça para a staff verificar os cargos do bot."),
        divider(),
        buttons(button(`ficha:v1:confirm:${session.id}:yes`, "Tentar concluir novamente", ButtonStyle.Success)),
      ], "erro")));
    }
  }
}

export async function handleSheetModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [command, action, sessionId] = interaction.customId.split(":");
  if (command !== "ficha" || action !== "appearance" || !sessionId) return;
  const session = await prisma.sheetCreationSession.findUnique({ where: { id: sessionId } });
  if (!session || session.discordId !== interaction.user.id || session.stage !== "APPEARANCE_CONFIRM" || !interaction.guild) {
    await interaction.reply({ content: "Esta correção de aparência expirou.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const identified = await standardizeTypedName(interaction.fields.getTextInputValue("nome"));
  if (!identified) {
    await interaction.editReply("❌ Não consegui interpretar esse personagem. Tente, por exemplo, `Luffy (One Piece)` ou `OC`.");
    return;
  }
  const data = parseData(session.dataJson);
  data.appearanceCandidate = identified;
  await updateSession(session.id, "APPEARANCE_CONFIRM", data);
  const latest = await prisma.sheetCreationSession.findUnique({ where: { id: session.id } });
  if (!latest) {
    await interaction.editReply("❌ A sessão de ficha não foi encontrada.");
    return;
  }
  const claimed = await claimSheetAppearance(interaction.guild, interaction.user.id, latest, data);
  if (!claimed.ok) {
    await interaction.editReply(claimed.message);
    return;
  }
  const channel = await resolveTextChannel(interaction.client, latest.channelId);
  if (channel) await sendAppearancePreview(channel, latest.id, claimed.data);
  await interaction.editReply("✅ Aparência corrigida, salva e reservada. Continue pela prévia enviada no canal da ficha.");
}

let scheduler: NodeJS.Timeout | null = null;
let schedulerRunning = false;

async function backfillSheetDeadlines(): Promise<void> {
  const sessions = await prisma.sheetCreationSession.findMany({
    where: {
      OR: [
        { channelId: { not: null }, channelExpiresAt: null },
        { stage: "CLAN_CHOICE", clanChoiceExpiresAt: { not: null } },
      ],
    },
  });
  for (const session of sessions) {
    await prisma.sheetCreationSession.update({
      where: { id: session.id },
      data: {
        ...(session.channelId && !session.channelExpiresAt
          ? { channelExpiresAt: new Date(session.createdAt.getTime() + SHEET_CHANNEL_TTL_MS) }
          : {}),
        ...(session.stage === "CLAN_CHOICE" && session.clanChoiceExpiresAt
          ? { clanChoiceExpiresAt: null }
          : {}),
      },
    });
  }
}

async function processDueSheetEvents(client: Client): Promise<number> {
  if (schedulerRunning) return 0;
  schedulerRunning = true;
  try {
    const now = new Date();
    let processed = 0;

    const expiredChannels = await prisma.sheetCreationSession.findMany({
      where: {
        channelId: { not: null },
        channelExpiresAt: { lte: now },
      },
      orderBy: { channelExpiresAt: "asc" },
    });
    for (const session of expiredChannels) {
      const expiredChannelId = session.channelId!;
      const channel = await client.channels.fetch(expiredChannelId).catch(() => null);
      if (channel && "delete" in channel) {
        const deleted = await channel.delete("Canal temporário de ficha expirado").then(() => true).catch((error) => {
          log.error(`Falha ao excluir canal de ficha ${expiredChannelId}:`, error);
          return false;
        });
        if (!deleted) continue;
      }
      if (session.stage === "COMPLETED") {
        await prisma.sheetCreationSession.deleteMany({
          where: { id: session.id, channelId: expiredChannelId },
        });
      } else {
        await prisma.sheetCreationSession.updateMany({
          where: { id: session.id, channelId: expiredChannelId },
          data: { channelId: null, channelExpiresAt: null },
        });
      }
      processed += 1;
    }
    return processed;
  } finally {
    schedulerRunning = false;
  }
}

export async function armSheetScheduler(client: Client): Promise<void> {
  if (scheduler) clearTimeout(scheduler);
  scheduler = null;
  const nextChannel = await prisma.sheetCreationSession.findFirst({
    where: { channelExpiresAt: { not: null } },
    orderBy: { channelExpiresAt: "asc" },
    select: { channelExpiresAt: true },
  });
  const deadlines = [nextChannel?.channelExpiresAt]
    .filter((date): date is Date => Boolean(date));
  if (!deadlines.length) return;
  const nextDeadline = Math.min(...deadlines.map((date) => date.getTime()));
  const delay = Math.min(60_000, Math.max(1_000, nextDeadline - Date.now()));
  scheduler = setTimeout(() => {
    void (async () => {
      try {
        await processDueSheetEvents(client);
      } finally {
        await armSheetScheduler(client).catch((error) => log.error("Falha ao rearmar fichas:", error));
      }
    })();
  }, delay);
  scheduler.unref?.();
}

export async function startSheetScheduler(client: Client): Promise<void> {
  await backfillSheetDeadlines();
  await processDueSheetEvents(client);
  const stalled = await prisma.sheetCreationSession.findMany({
    where: {
      channelId: { not: null },
      stage: { in: ["CLAN_CHOICE", "TRAIT_ROLL", "FINALIZING"] },
    },
  });
  for (const session of stalled) {
    const channel = await resolveTextChannel(client, session.channelId);
    if (!channel) continue;
    const data = parseData(session.dataJson);
    if (session.stage === "CLAN_CHOICE" && data.clanOptions.length) {
      await runClanAnimation(channel, session.id, data.clanOptions).catch((error) =>
        log.error(`Falha ao restaurar escolha de clã ${session.id}:`, error),
      );
    } else if (session.stage === "TRAIT_ROLL") {
      await runTraitAnimation(channel, session.id, data).catch((error) =>
        log.error(`Falha ao restaurar sorteio de trait ${session.id}:`, error),
      );
    } else if (session.stage === "FINALIZING") {
      const restored = await transitionSession(session.id, "FINALIZING", "CONFIRM", data);
      if (restored) {
        await channel.send(v2Public(card([
          heading("Finalização retomada"),
          text("O bot reiniciou durante a conclusão. Seus dados continuam salvos; use o botão para tentar novamente."),
          divider(),
          buttons(button(`ficha:v1:confirm:${session.id}:yes`, "Concluir ficha", ButtonStyle.Success)),
        ], "aviso"))).catch(() => undefined);
      }
    }
  }
  await armSheetScheduler(client);
}

export function stopSheetScheduler(): void {
  if (scheduler) clearTimeout(scheduler);
  scheduler = null;
}
