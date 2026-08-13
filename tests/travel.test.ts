import { describe, expect, it } from "vitest";
import { MessageFlags } from "discord.js";
import {
  ALL_TRAVEL_ROLE_IDS,
  TRAVEL_LOCATION_IDS,
  TRAVEL_LOCATIONS,
  TRAVEL_PATH_ROLE_IDS,
  travelLocationFromChannel,
  travelMinutes,
  travelPath,
} from "../src/data/travel.js";
import { renderTravelMenu, viajar } from "../src/commands/viajar.js";
import { v2Payload } from "../src/ui/economy-components-v2.js";

describe("sistema de viagem", () => {
  it("mapeia todos os portões e canais do mundo aberto para uma origem", () => {
    for (const id of TRAVEL_LOCATION_IDS) {
      for (const channelId of TRAVEL_LOCATIONS[id].channelIds) {
        expect(travelLocationFromChannel(channelId)).toBe(id);
      }
    }
    expect(travelLocationFromChannel("canal-invalido")).toBeNull();
  });

  it("mantém todas as rotas simétricas dentro de 5 a 20 minutos", () => {
    for (const origin of TRAVEL_LOCATION_IDS) {
      for (const destination of TRAVEL_LOCATION_IDS) {
        const minutes = travelMinutes(origin, destination);
        if (origin === destination) expect(minutes).toBe(0);
        else expect(minutes).toBeGreaterThanOrEqual(5);
        if (origin !== destination) expect(minutes).toBeLessThanOrEqual(20);
        expect(minutes).toBe(travelMinutes(destination, origin));
      }
    }
  });

  it("escolhe caminhos coerentes para biomas e vilas", () => {
    expect(travelPath("KONOHA", "FLORESTA")).toBe("FLORESTA");
    expect(travelPath("KUMO", "MONTANHAS")).toBe("MONTANHA");
    expect(travelPath("KONOHA", "SUNA")).toBe("DESERTO");
    expect(travelPath("CAMPO_ABERTO", "IWA")).toBe("MONTANHA");
    expect(travelPath("DESERTO", "CAMPO_ABERTO")).toBe("DESERTO");
  });

  it("não repete cargos de localização ou caminho", () => {
    expect(new Set(ALL_TRAVEL_ROLE_IDS).size).toBe(ALL_TRAVEL_ROLE_IDS.length);
    expect(TRAVEL_PATH_ROLE_IDS).toHaveLength(3);
  });

  it("renderiza um painel efêmero Components V2 com vilas e mundo aberto separados", () => {
    const components = renderTravelMenu("KONOHA");
    const payload = v2Payload(components);
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
    expect(payload).not.toHaveProperty("embeds");
    expect(payload).not.toHaveProperty("content");
    expect(components).toHaveLength(1);

    const container = components[0]!.toJSON();
    expect(container.type).toBe(17);
    const serialized = JSON.stringify(container);
    expect(serialized).toContain("Vilas Ocultas");
    expect(serialized).toContain("Mundo Aberto");
    expect(serialized).toContain("viajar:v1:go:KONOHA:SUNA");
    expect("components" in container ? container.components.length : 0).toBeLessThanOrEqual(10);
  });

  it("registra o slash command /viajar", () => {
    expect(viajar.data.toJSON().name).toBe("viajar");
  });
});
