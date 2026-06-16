import type { Command } from "./types.js";
import { perfil } from "./perfil.js";
import { mapa } from "./mapa.js";
import { combate } from "./combate.js";
import { mover } from "./mover.js";
import { jutsu } from "./jutsu.js";
import { party } from "./party.js";
import { missoes } from "./missoes.js";
import { interagir } from "./interagir.js";
import { admin } from "./admin.js";
import { aparencia } from "./aparencia.js";

export const commands: Command[] = [perfil, mapa, combate, mover, jutsu, party, missoes, interagir, admin, aparencia];

export const commandMap = new Map<string, Command>(commands.map((c) => [c.data.name, c]));
