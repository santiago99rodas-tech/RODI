import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Minimal moderation panel for Fase 3 Milestone 6 (Community). Community
// reads are public (apps.proxy.tsx), so this page is the only gate between
// a Club member's post and everyone else seeing it live — ships alongside
// Community itself, not after, per the user's explicit decision earlier in
// this project.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // flagged first (members' reports hide a post after three), then the newest
  const posts = await db.communityPost.findMany({
    where: { shop },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 150,
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  posts.sort((x, y) => Number(y.status === "flagged") - Number(x.status === "flagged") || +new Date(y.createdAt) - +new Date(x.createdAt));
  return { posts };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const type = String(form.get("type"));
  const id = String(form.get("id"));
  const status = String(form.get("status"));

  if (!["published", "flagged", "removed"].includes(status)) {
    return { error: "Estado no válido" };
  }

  if (type === "post") {
    await db.communityPost.updateMany({ where: { id, shop }, data: { status } });
  } else if (type === "reply") {
    const reply = await db.communityReply.findFirst({ where: { id, shop } });
    if (!reply) return { error: "No encontrado" };
    await db.communityReply.update({ where: { id }, data: { status } });
    // keep the visible reply counter (and the 10-reply cap) in step with what the forum shows
    const visible = await db.communityReply.count({ where: { postId: reply.postId, status: "published" } });
    await db.communityPost.update({ where: { id: reply.postId }, data: { replyCount: visible } });
  } else {
    return { error: "Tipo no válido" };
  }

  return { ok: true };
};

type StatusValue = "published" | "flagged" | "removed";
const STATUS_LABEL: Record<string, string> = { published: "Publicado", flagged: "Marcado", removed: "Retirado" };

function StatusButtons({ type, id, current, fetcher }: { type: string; id: string; current: string; fetcher: ReturnType<typeof useFetcher> }) {
  const options: StatusValue[] = ["published", "flagged", "removed"];
  return (
    <s-stack direction="inline" gap="base">
      {options.map((status) => (
        <s-button
          key={status}
          variant={status === current ? "primary" : "secondary"}
          onClick={() => fetcher.submit({ type, id, status }, { method: "POST" })}
        >
          {STATUS_LABEL[status]}
        </s-button>
      ))}
    </s-stack>
  );
}

export default function CommunityModeration() {
  const { posts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data && "error" in fetcher.data && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const flagged = posts.filter((p) => p.status === "flagged" || p.replies.some((r) => r.status === "flagged")).length;

  return (
    <s-page heading="Moderación de la comunidad">
      <s-section heading={`Publicaciones (${posts.length}) · por revisar: ${flagged}`}>
        {posts.length === 0 ? (
          <s-paragraph>Aún no hay publicaciones.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {posts.map((p) => (
              <s-box key={p.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack gap="base">
                  <s-text fontWeight="bold">
                    {p.type === "question" ? "Pregunta" : "Recomendación"}: {p.title}
                  </s-text>
                  <s-text tone="neutral">
                    {p.authorName} · {new Date(p.createdAt).toLocaleDateString("es-CO")} · {p.country ?? "sin país"}
                    {p.city ? ` / ${p.city}` : ""} · tema: {p.topic} · 👍 {p.likeCount} · reportes: {p.reportCount} · estado: {STATUS_LABEL[p.status] ?? p.status}
                  </s-text>
                  <s-paragraph>{p.body}</s-paragraph>
                  <StatusButtons type="post" id={p.id} current={p.status} fetcher={fetcher} />
                  {p.replies.length > 0 && (
                    <s-stack gap="base">
                      {p.replies.map((a) => (
                        <s-box key={a.id} padding="base" background="subdued" borderRadius="base">
                          <s-stack gap="base">
                            <s-text tone="neutral">
                              {a.authorName} respondió · 👍 {a.likeCount} · reportes: {a.reportCount} · estado: {STATUS_LABEL[a.status] ?? a.status}
                            </s-text>
                            <s-paragraph>{a.body}</s-paragraph>
                            <StatusButtons type="reply" id={a.id} current={a.status} fetcher={fetcher} />
                          </s-stack>
                        </s-box>
                      ))}
                    </s-stack>
                  )}
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
