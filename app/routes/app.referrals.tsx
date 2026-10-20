import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { REFERRAL_FRIEND_MONTHS, REFERRAL_MAX_PENDING, REFERRAL_REFERRER_MAX_MONTHS, REFERRAL_REFERRER_MONTHS } from "../referral.server";

// "Refiere a un amigo": who invited whom and what was paid. Read-only; the rules live in app/referral.server.ts.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [codes, pending, rewarded, recent] = await Promise.all([
    db.referralCode.count({ where: { shop } }),
    db.referral.count({ where: { shop, status: "pending" } }),
    db.referral.count({ where: { shop, status: "rewarded" } }),
    db.referral.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return {
    shop,
    codes,
    pending,
    rewarded,
    recent: recent.map((r) => ({ id: r.id, referrerId: r.referrerId, referredId: r.referredId, status: r.status, createdAt: r.createdAt.toISOString(), rewardedAt: r.rewardedAt?.toISOString() ?? null })),
  };
};

export default function Referrals() {
  const { shop, codes, pending, rewarded, recent } = useLoaderData<typeof loader>();
  const store = shop.replace(".myshopify.com", "");
  const customerUrl = (id: string) => `https://admin.shopify.com/store/${store}/customers/${id}`;
  const day = (iso: string) => new Date(iso).toLocaleDateString("es-CO");
  return (
    <s-page heading="Invita a un amigo">
      <s-section heading="Cómo funciona">
        <s-paragraph>
          Cada miembro tiene un código y un enlace (rodiclub.com/?ref=CÓDIGO). Cuando su amigo entra con ese enlace, crea su cuenta y crea su primer viaje, el amigo recibe {REFERRAL_FRIEND_MONTHS} mes de Club y quien invitó recibe {REFERRAL_REFERRER_MONTHS} mes (hasta {REFERRAL_REFERRER_MAX_MONTHS} meses en total). La cuenta del amigo debe tener menos de 30 días y ningún viaje previo; cada persona acepta una sola invitación y cada miembro puede tener hasta {REFERRAL_MAX_PENDING} invitaciones pendientes.
        </s-paragraph>
      </s-section>
      <s-section heading="Resumen">
        <s-paragraph>
          Códigos creados: {codes} · Esperando el primer viaje: {pending} · Premiadas: {rewarded}
        </s-paragraph>
      </s-section>
      <s-section heading="Últimas invitaciones">
        {recent.length === 0 ? (
          <s-paragraph>Todavía nadie ha entrado con una invitación.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {recent.map((r) => (
              <s-box key={r.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack gap="small-200">
                  <s-text>
                    <s-link href={customerUrl(r.referrerId)} target="_blank">Quien invitó</s-link> → <s-link href={customerUrl(r.referredId)} target="_blank">Quien entró</s-link>
                  </s-text>
                  <s-text tone="neutral">
                    {r.status === "rewarded" ? `Premiada el ${day(r.rewardedAt ?? r.createdAt)}` : "Esperando su primer viaje"} · entró el {day(r.createdAt)}
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
