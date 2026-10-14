import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const SECTIONS: { href: string; title: string; text: string }[] = [
  { href: "/app/memberships", title: "Club memberships", text: "See who is Free or Club, grant or remove Club access, and send the welcome email." },
  { href: "/app/membership-backfill", title: "Club launch promo backfill", text: "Give the launch access to members who joined before the promo." },
  { href: "/app/community-moderation", title: "Community moderation", text: "Review questions, answers and recommendations; hide or restore posts." },
  { href: "/app/service-inquiries", title: "RODI Services inquiries", text: "Requests members sent for RODI Services, with status and internal notes." },
  { href: "/app/email", title: "Email (Resend)", text: "Sending status and a test send for the app emails." },
  { href: "/app/campaigns", title: "Campaigns", text: "Preview and send marketing emails to an audience." },
  { href: "/app/abandoned-carts", title: "Abandoned carts", text: "Reminder emails for checkouts that were not completed." },
  { href: "/app/backups", title: "Database backups", text: "Automatic backups, off-server copies and manual download." },
  { href: "/app/calculator-usage", title: "Calculator usage", text: "How members use the trip cost calculator (aggregates only)." },
];

export default function Index() {
  return (
    <s-page heading="RODI Trip Planner">
      <s-section heading="Admin tools">
        <s-paragraph>The planner itself runs in the store at /apps/trip-planner. These pages manage what sits behind it.</s-paragraph>
        <s-stack direction="block" gap="base">
          {SECTIONS.map((s) => (
            <s-box key={s.href} padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="small">
                <s-link href={s.href}>{s.title}</s-link>
                <s-paragraph>{s.text}</s-paragraph>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
