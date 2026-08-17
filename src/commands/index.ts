import type { Command } from "./types.js";
import { perfil } from "./perfil.js";
import { atributos } from "./atributos.js";
import { mapa } from "./mapa.js";
import { combate } from "./combate.js";
import { mover } from "./mover.js";
import { jutsu } from "./jutsu.js";
import { party } from "./party.js";
import { missoes } from "./missoes.js";
import { interagir } from "./interagir.js";
import { admin } from "./admin.js";
import { adminVila } from "./admin-vila.js";
import { vila } from "./vila.js";
import { loja } from "./loja.js";
import { lojaPremium } from "./loja-premium.js";
import { aparencia } from "./aparencia.js";
import { clear } from "./clear.js";
import { bonecoTreino } from "./boneco-treino.js";
import { invocacao } from "./invocacao.js";
import { inventario } from "./inventario.js";
import { acao } from "./acao.js";
import { craft } from "./craft.js";
import { marionetes } from "./marionetes.js";
import { comer } from "./comer.js";
import { sincronizarVila } from "./sincronizar-vila.js";
import { viajar } from "./viajar.js";
import { ficha } from "./ficha.js";
import { arremessar, atacar, darItem, desequipar, equipar, largarItem, restaurarPergaminho, usarItem } from "./itens.js";

export const commands: Command[] = [
  perfil,
  atributos,
  inventario,
  acao,
  craft,
  marionetes,
  comer,
  sincronizarVila,
  viajar,
  ficha,
  vila,
  loja,
  lojaPremium,
  equipar,
  desequipar,
  restaurarPergaminho,
  atacar,
  arremessar,
  usarItem,
  darItem,
  largarItem,
  mapa,
  combate,
  mover,
  jutsu,
  party,
  missoes,
  interagir,
  admin,
  adminVila,
  aparencia,
  clear,
  bonecoTreino,
  invocacao,
];

export const commandMap = new Map<string, Command>(commands.map((c) => [c.data.name, c]));
