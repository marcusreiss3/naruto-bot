import { MercadoPagoConfig, Payment, Preference, WebhookSignatureValidator, InvalidWebhookSignatureError } from "mercadopago";
import { prisma } from "../../db/client.js";
import { ENV, HAS_MERCADO_PAGO, HAS_MERCADO_PAGO_CHECKOUT } from "../../config/env.js";
import { getIngotPackage } from "../../data/ingot-packages.js";
import { getPremiumWallet } from "./ingot-store.js";

export class IngotCheckoutError extends Error {}

// Uma unica instancia do client, so' criada quando o token existe — assim
// nenhum outro arquivo do site quebra ao importar isso sem o Mercado Pago
// configurado (dev local, por exemplo).
const mpConfig = HAS_MERCADO_PAGO ? new MercadoPagoConfig({ accessToken: ENV.MP_ACCESS_TOKEN }) : null;

// Cria o pedido pendente no banco e a preferencia no Mercado Pago. O preco e
// a quantidade de Ingots vem SEMPRE do catalogo do servidor (INGOT_PACKAGES),
// nunca de nada que o cliente mande — o body do checkout so' carrega o id do
// pacote escolhido.
export async function createIngotCheckout(discordId: string, guildId: string, packageId: string): Promise<{ url: string }> {
  if (!mpConfig || !HAS_MERCADO_PAGO_CHECKOUT) throw new IngotCheckoutError("Pagamento por PIX/cartão ainda não está disponível.");
  const pkg = getIngotPackage(packageId);
  if (!pkg) throw new IngotCheckoutError("Pacote de Ingots desconhecido.");

  const order = await prisma.ingotOrder.create({
    data: { discordId, guildId, packageId: pkg.id, ingots: pkg.ingots, amountCents: pkg.priceCents },
  });

  const preference = new Preference(mpConfig);
  let response;
  try {
    response = await preference.create({
      body: {
        items: [{
          id: pkg.id,
          title: `${pkg.title} — ${pkg.ingots.toLocaleString("pt-BR")} Ingots`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: pkg.priceCents / 100,
        }],
        external_reference: order.id,
        notification_url: `${ENV.WEB_BASE_URL}/api/premium/webhook`,
        back_urls: {
          success: `${ENV.WEB_BASE_URL}/#/ingots`,
          pending: `${ENV.WEB_BASE_URL}/#/ingots`,
          failure: `${ENV.WEB_BASE_URL}/#/ingots`,
        },
        auto_return: "approved",
      },
    });
  } catch (error) {
    await prisma.ingotOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    throw error;
  }

  if (!response.id || !response.init_point) {
    await prisma.ingotOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    throw new IngotCheckoutError("Não foi possível iniciar o pagamento. Tente novamente.");
  }
  await prisma.ingotOrder.update({ where: { id: order.id }, data: { preferenceId: response.id } });
  return { url: response.init_point };
}

export type WebhookOutcome = { handled: boolean; reason?: string };

// So' aceita a notificacao se a assinatura bater com MP_WEBHOOK_SECRET —
// sem isso, qualquer POST forjado poderia "aprovar" um pedido e creditar
// Ingots de graca. Falha de validacao = rejeita, nunca ignora em silencio.
export async function handleMercadoPagoWebhook(input: {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
  type: string | undefined;
}): Promise<WebhookOutcome> {
  if (!mpConfig) return { handled: false, reason: "Mercado Pago não configurado." };
  if (!ENV.MP_WEBHOOK_SECRET) return { handled: false, reason: "MP_WEBHOOK_SECRET não configurado." };
  if (input.type !== "payment" || !input.dataId) return { handled: false, reason: "Evento ignorado (não é pagamento)." };

  try {
    WebhookSignatureValidator.validate({
      xSignature: input.xSignature,
      xRequestId: input.xRequestId,
      dataId: input.dataId,
      secret: ENV.MP_WEBHOOK_SECRET,
    });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) return { handled: false, reason: `Assinatura inválida: ${error.reason}` };
    throw error;
  }

  const payment = new Payment(mpConfig);
  const paymentData = await payment.get({ id: input.dataId });
  const orderId = paymentData.external_reference;
  const paymentId = paymentData.id ? String(paymentData.id) : undefined;
  if (!orderId || !paymentId) return { handled: false, reason: "Pagamento sem external_reference/id." };

  const order = await prisma.ingotOrder.findUnique({ where: { id: orderId } });
  if (!order) return { handled: false, reason: `Pedido ${orderId} não encontrado.` };
  if (order.status !== "PENDING") return { handled: true, reason: `Pedido já estava ${order.status}.` };

  if (paymentData.status === "approved") {
    // Update condicional em status=PENDING: se duas notificacoes chegarem
    // em paralelo, so' a primeira credita — a segunda cai no count!==1 e
    // sai sem duplicar.
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.ingotOrder.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: { status: "APPROVED", paymentId },
      });
      if (claimed.count !== 1) return;
      const wallet = await getPremiumWallet(order.discordId, order.guildId);
      await tx.premiumWallet.update({ where: { id: wallet.id }, data: { ingots: { increment: order.ingots } } });
    });
    return { handled: true };
  }

  if (paymentData.status === "rejected" || paymentData.status === "cancelled") {
    await prisma.ingotOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: paymentData.status === "rejected" ? "REJECTED" : "CANCELLED", paymentId },
    });
    return { handled: true };
  }

  return { handled: true, reason: `Status ${paymentData.status} — aguardando.` };
}
