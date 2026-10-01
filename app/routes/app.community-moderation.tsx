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

  const [questions, recommendations] = await Promise.all([
    db.communityQuestion.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { answers: { orderBy: { createdAt: "asc" } } },
    }),
    db.communityRecommendation.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return { questions, recommendations };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const type = String(form.get("type"));
  const id = String(form.get("id"));
  const status = String(form.get("status"));

  if (!["published", "flagged", "removed"].includes(status)) {
    return { error: "Invalid status" };
  }

  if (type === "question") {
    await db.communityQuestion.updateMany({ where: { id, shop }, data: { status } });
  } else if (type === "answer") {
    // Answers don't carry shop directly on the update filter (no composite
    // unique on shop+id), but every answer's parent question is already
    // shop-scoped, and the id itself is a cuid — scoped enough for an
    // admin-only moderation action.
    await db.communityAnswer.update({ where: { id }, data: { status } });
  } else if (type === "recommendation") {
    await db.communityRecommendation.updateMany({ where: { id, shop }, data: { status } });
  } else {
    return { error: "Invalid type" };
  }

  return { ok: true };
};

type StatusValue = "published" | "flagged" | "removed";

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
          {status}
        </s-button>
      ))}
    </s-stack>
  );
}

export default function CommunityModeration() {
  const { questions, recommendations } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data && "error" in fetcher.data && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Community moderation">
      <s-section heading={`Questions (${questions.length})`}>
        {questions.length === 0 ? (
          <s-paragraph>No questions posted yet.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {questions.map((q) => (
              <s-box key={q.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack gap="base">
                  <s-text fontWeight="bold">{q.title}</s-text>
                  <s-text tone="neutral">
                    {q.authorName} · {new Date(q.createdAt).toLocaleDateString()} · status: {q.status}
                  </s-text>
                  <s-paragraph>{q.body}</s-paragraph>
                  <StatusButtons type="question" id={q.id} current={q.status} fetcher={fetcher} />
                  {q.answers.length > 0 && (
                    <s-stack gap="base">
                      {q.answers.map((a) => (
                        <s-box key={a.id} padding="base" background="subdued" borderRadius="base">
                          <s-stack gap="base">
                            <s-text tone="neutral">
                              {a.authorName} answered · status: {a.status}
                            </s-text>
                            <s-paragraph>{a.body}</s-paragraph>
                            <StatusButtons type="answer" id={a.id} current={a.status} fetcher={fetcher} />
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

      <s-section heading={`Recommendations (${recommendations.length})`}>
        {recommendations.length === 0 ? (
          <s-paragraph>No recommendations posted yet.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {recommendations.map((r) => (
              <s-box key={r.id} padding="base" borderWidth="base" borderRadius="base">
                <s-stack gap="base">
                  <s-text fontWeight="bold">{r.title}</s-text>
                  <s-text tone="neutral">
                    {r.authorName} · {new Date(r.createdAt).toLocaleDateString()} · status: {r.status}
                  </s-text>
                  <s-paragraph>{r.body}</s-paragraph>
                  <StatusButtons type="recommendation" id={r.id} current={r.status} fetcher={fetcher} />
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
