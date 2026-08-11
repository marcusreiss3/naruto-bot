// Erro de regra economica com mensagem pronta para o jogador.
//
// Os helpers de cofre/estoque/inventario LANCAM em vez de retornar `ok:false`
// de proposito: eles quase sempre rodam dentro de um `prisma.$transaction`
// maior (tirar material do jogador + somar no estoque + gravar ledger), e
// lancar e' o que garante que a transacao inteira desfaz. Quem chama de fora
// envolve com `runEconomy()` para traduzir de volta em resultado.
export class EconomyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EconomyError";
  }
}

export type EconomyResult<T> = ({ ok: true } & T) | { ok: false; error: string };

// Traduz EconomyError em resultado; qualquer outro erro continua subindo,
// porque bug nao pode virar mensagem amigavel.
export async function runEconomy<T extends object>(
  fn: () => Promise<T>,
): Promise<EconomyResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof EconomyError) return { ok: false, error: err.message };
    throw err;
  }
}
