import type { MissionDef } from "../types.js";

// Textos exclusivos do mural: todos foram revisados contra objetivos e
// handlers das missões e cabem em no máximo duas linhas do card.
const SUMMARIES: Record<string, string> = {
  gato_perdido: "Takamaru perdeu o gato Tora na Praça. Encontre-o e capture-o antes que fuja de novo.",
  limpar_vila: "Recolha o lixo da Praça e do Centro Comercial para deixar a Vila da Folha limpa.",
  ladrao_de_bolsas: "Siga o ladrão que roubou a bolsa de uma senhora e devolva o pertence à dona.",
  peca_comedia_genin: "Descubra o que diverte três crianças da Academia e conquiste a plateia na peça.",
  bolinhos_horario_pico: "Ajude o vendedor do Centro Comercial a preparar bolinhos no ritmo do horário de pico.",
  limpar_telhado_academia: "Limpe os pontos marcados no telhado da Academia e afaste os pombos que tomaram o local.",
  organizar_arquivos_hokage: "Organize os pergaminhos fora de ordem nos arquivos da Mansão do Hokage.",
  ervas_medicinais_hospital: "Busque ervas frescas na Floresta para os remédios urgentes do Hospital de Konoha.",
  preparar_festival_vila: "Prepare barracas e lanternas do festival, impedindo trapaças com jutsu nos jogos.",
  ninken_em_treinamento: "Siga o rastro verdadeiro de um ninken jovem e devolva-o ao treinador em segurança.",
  separar_briga_vendedores: "Ouça os dois vendedores acusados de roubo e resolva a briga sem usar violência.",
  treino_substituicao_bonecos: "Conserte os bonecos da Academia e teste se ainda servem ao treino de substituição.",
  remover_ninhos_vespas: "Remova os ninhos de vespas perto da Academia sem ferir alunos ou danificar o prédio.",
  entrega_urgente_ichiraku: "Leve os pedidos do Ichiraku pela vila antes que o caldo esfrie.",
  clone_infiltrado_academia: "Compare as pistas e descubra qual das três versões de Kenta é o aluno verdadeiro.",
  entregas_urgentes_folha: "Identifique três encomendas oficiais pela pista de seus selos e entregue cada uma no destino certo.",
  coleta_agua_limpa: "Analise água da Floresta e da Rota Comercial para levar amostras seguras ao Hospital.",
  patrulha_noturna_beco: "Patrulhe o Beco de Konoha, proteja os civis e encontre quem provoca os barulhos noturnos.",

  lider_bandidos: "Investigue os roubos no Centro Comercial e enfrente o líder dos bandidos na Floresta.",
  seguranca_festival: "Patrulhe o festival, revele os infiltrados e impeça o ataque aos visitantes.",
  patrulha_noturna_distrito: "Siga as sombras pelos telhados do distrito e sobreviva à emboscada dos criminosos.",
  falsos_ninjas_vila: "Desmascare falsos ninjas que extorquem comerciantes e recupere o dinheiro roubado.",
  ataque_deposito_suprimentos: "Encontre o infiltrado e defenda o depósito contra duas ondas de invasores.",
  crianca_importante_fugiu: "Reúna depoimentos sobre Ayaka, siga o rastro pelo beco e salve-a dos sequestradores.",
  praga_insetos_chakra: "Investigue os insetos de chakra que destroem estoques e contenha a colônia responsável.",
  mensagem_criptografada_interceptada: "Decifre a mensagem inimiga e interrompa o encontro criminoso antes da troca de informações.",
  resgate_mina_caverna: "Abra a passagem da caverna, resgate os trabalhadores presos e derrote os bandidos.",
  protecao_festival_itinerante: "Proteja a trupe na estrada, encontre o informante e recupere os baús roubados.",
  armadilha_rota_comercial: "Desarme a rota sabotada e conduza civis presos para uma travessia segura.",
  roubo_no_hospital: "Investigue os remédios desaparecidos e descubra o roubo cometido por desespero familiar.",
  ponte_danificada: "Repare a ponte sabotada, atravesse os civis e enfrente quem preparou a armadilha.",
  resgate_rio_enchente: "Resgate civis presos pela cheia e pare os bandidos que causaram o bloqueio no rio.",
  incendio_barracas: "Evacue as barracas, apague os focos e encontre o ninja Katon por trás das explosões.",
  cacada_nukenin_menor: "Siga os informantes e capture o nukenin menor escondido perto de Konoha.",
  contrabando_no_rio: "Investigue as cargas noturnas no rio, identifique o barco falso e pare os contrabandistas.",
  emboscada_no_deserto: "Proteja a caravana nas dunas e derrote os saqueadores que atacam a fronteira de Suna.",
  colecionador_bandanas: "Rastreie as bandanas roubadas pelo mercado clandestino e derrote o colecionador.",
  escolta_comerciante: "Escolte o comerciante de tecidos de Konoha até a rota mercante de Sunagakure.",

  herdeiro_cla_yuki: "Investigue as mensagens de gelo entre vilas e liberte os reféns presos nos espelhos.",
  infiltracao_posto_inimigo: "Infiltre-se no posto do Campo Aberto e elimine os guardas antes dos reforços chegarem.",
  pulso_do_cadaver: "Descubra por que um cadáver ainda pulsa e impeça um médico renegado de usar a vítima.",
  mascara_de_cinzas: "Siga as pistas do mascarado de elite e revele a verdade por trás das execuções.",
  sino_que_nao_deve_tocar: "Encontre os fragmentos do sino e impeça Reika de apagar um tratado da memória de Konoha.",
};

export function missionBoardSummary(mission: MissionDef): string {
  return SUMMARIES[mission.id] ?? mission.description;
}

export function hasMissionBoardSummary(missionId: string): boolean {
  return missionId in SUMMARIES;
}
