import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Fase 4, RODI Services. There's no live payment gateway (Fase 2 is
// paused), so createServiceInquiry (apps.proxy.tsx) is a waitlist/inquiry
// pipeline, not a purchase — this page is where RODI actually processes
// those requests: see what customers asked for, move the status along, and
// leave an internal note for context. internalNote never reaches the
// customer-facing services=1 read.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const inquiries = await db.serviceInquiry.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { trip: { select: { title: true } } },
  });

  return { inquiries };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const id = String(form.get("id"));
  const intent = form.get("intent");

  if (intent === "delete") {
    await db.serviceInquiry.deleteMany({ where: { id, shop } });
    return { ok: true };
  }

  const status = form.get("status");
  const internalNote = form.get("internalNote");

  const data: { status?: string; internalNote?: string } = {};
  if (typeof status === "string" && status) {
    if (!["information_required", "in_review", "delivered", "closed", "purchased"].includes(status)) {
      return { error: "Invalid status" };
    }
    data.status = status;
  }
  if (typeof internalNote === "string") {
    data.internalNote = internalNote;
  }

  await db.serviceInquiry.updateMany({ where: { id, shop }, data });
  return { ok: true };
};

const STATUSES = ["information_required", "in_review", "delivered", "closed", "purchased"] as const;

function InquiryRow({ inquiry, fetcher }: { inquiry: any; fetcher: ReturnType<typeof useFetcher> }) {
  const [note, setNote] = useState(inquiry.internalNote || "");

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack gap="base">
        <s-text fontWeight="bold">{inquiry.serviceType}</s-text>
        <s-text tone="neutral">
          Customer {inquiry.customerId} · {new Date(inquiry.createdAt).toLocaleDateString()}
          {inquiry.trip ? ` · Trip: ${inquiry.trip.title}` : ""}
        </s-text>
        {inquiry.notes && <s-paragraph>Customer notes: {inquiry.notes}</s-paragraph>}

        <s-stack direction="inline" gap="base">
          {STATUSES.map((s) => (
            <s-button
              key={s}
              variant={s === inquiry.status ? "primary" : "secondary"}
              onClick={() => fetcher.submit({ id: inquiry.id, status: s }, { method: "POST" })}
            >
              {s}
            </s-button>
          ))}
        </s-stack>

        <s-text-area
          label="Internal note (never shown to the customer)"
          value={note}
          onInput={(e: any) => setNote(e.target.value)}
        ></s-text-area>
        <s-button
          onClick={() => fetcher.submit({ id: inquiry.id, internalNote: note }, { method: "POST" })}
        >
          Save note
        </s-button>

        <s-button
          tone="critical"
          onClick={() => {
            if (!window.confirm(`Permanently delete this ${inquiry.serviceType} inquiry? This cannot be undone.`)) return;
            fetcher.submit({ id: inquiry.id, intent: "delete" }, { method: "POST" });
          }}
        >
          Delete permanently
        </s-button>
      </s-stack>
    </s-box>
  );
}

export default function ServiceInquiries() {
  const { inquiries } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data && "error" in fetcher.data && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="RODI Services — inquiries">
      <s-section heading={`Inquiries (${inquiries.length})`}>
        {inquiries.length === 0 ? (
          <s-paragraph>No service inquiries yet.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {inquiries.map((inquiry) => (
              <InquiryRow key={inquiry.id} inquiry={inquiry} fetcher={fetcher} />
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
