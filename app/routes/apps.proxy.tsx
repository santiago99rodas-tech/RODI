import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { resolveMembership } from "../membership.server";

// Fase 3 Free-tier limits. Not configurable from Admin yet (no admin UI
// exists in this app) — change these constants and redeploy if they need
// to move.
const FREE_TRIP_LIMIT = 1;
const FREE_TIMELINE_ACTIVITY_LIMIT = 5;
const FREE_BUDGET_EXPENSE_LIMIT = 10;

// Single endpoint for the theme's Trip Planner UI, reached via Shopify's App
// Proxy at /apps/trip-planner on the storefront. The proxy signs the request
// (validated by authenticate.public.appProxy) and Shopify injects
// logged_in_customer_id itself based on the visitor's real session, so it
// can't be spoofed by the client — that's what scopes every read/write to
// "this customer's own trips" below.

function getCustomerId(request: Request): string | null {
  const { searchParams } = new URL(request.url);
  return searchParams.get("logged_in_customer_id");
}

async function assertTripOwnership(tripId: string, shop: string, customerId: string) {
  const trip = await db.trip.findFirst({ where: { id: tripId, shop, customerId } });
  if (!trip) throw new Response("Not found", { status: 404 });
  return trip;
}

// Travel Readiness (Fase 3, Milestone 3) — a 0-100 score computed on the fly
// from data the trip already has, no new table. Weights match the plan:
// dates 20%, documents 20%, packing 25%, budget 15%, itinerary 20%. Each
// bucket's ratio is 0..1 "how complete is this part"; the overall score is
// the weighted sum. Free members only ever get the number back — the
// breakdown and recommendations are trimmed server-side, not just hidden in
// the theme, so a Free member can't read them by calling the proxy directly.
type ReadinessTripInput = {
  startDate: Date | null;
  endDate: Date | null;
  budgetTotal: number | null;
  documents: { id: string }[];
  checklist: { done: boolean }[];
  days: { activities: { id: string }[] }[];
};

function computeReadiness(trip: ReadinessTripInput) {
  const buckets = [
    { key: "dates", weight: 20, ratio: trip.startDate && trip.endDate ? 1 : 0 },
    { key: "documents", weight: 20, ratio: Math.min(trip.documents.length / 2, 1) },
    {
      key: "packing",
      weight: 25,
      ratio: trip.checklist.length
        ? trip.checklist.filter((c) => c.done).length / trip.checklist.length
        : 0,
    },
    { key: "budget", weight: 15, ratio: trip.budgetTotal != null ? 1 : 0 },
    {
      key: "itinerary",
      weight: 20,
      ratio: trip.days.length
        ? trip.days.filter((d) => d.activities.length > 0).length / trip.days.length
        : 0,
    },
  ];
  const score = Math.round(buckets.reduce((sum, b) => sum + b.ratio * b.weight, 0));
  return { score, buckets };
}

// Smart Packing v1 (Fase 3, Milestone 4, Club-only) — a deterministic,
// rule-based list from the two trip signals that are actually structured
// today: dates (season) and duration (day count). Trip.destination is a
// free-text field (not a metaobject), and Activity.category is never
// populated by any current UI flow, so neither can drive generation yet
// without a larger change — a documented v1 simplification, not an oversight.
// Season uses calendar month only (no hemisphere data on the trip), so it's
// Northern-hemisphere-biased; acceptable for a v1 heuristic.
// Category keys match the ones rodi-packing.liquid already renders labels
// for (DEFAULT_CATEGORIES there), so generated items group under the same
// headings as the manually-seeded default template.
const SMART_BASE_ITEMS: { label: string; category: string }[] = [
  { label: "Pasaporte / documento de identidad", category: "documents" },
  { label: "Tarjetas de viaje y seguro médico", category: "documents" },
  { label: "Efectivo y tarjetas", category: "documents" },
  { label: "Cargador de celular", category: "tech" },
  { label: "Adaptador de corriente", category: "tech" },
  { label: "Power bank", category: "tech" },
  { label: "Botiquín básico", category: "health" },
  { label: "Medicamentos personales", category: "health" },
  { label: "Calzado cómodo para caminar", category: "shoes" },
];

const SMART_SEASON_ITEMS: Record<string, { label: string; category: string }[]> = {
  winter: [
    { label: "Abrigo grueso", category: "clothing" },
    { label: "Bufanda y guantes", category: "clothing" },
    { label: "Gorro", category: "clothing" },
    { label: "Capas térmicas", category: "clothing" },
  ],
  spring: [
    { label: "Chaqueta ligera", category: "clothing" },
    { label: "Paraguas o impermeable", category: "accessories" },
  ],
  summer: [
    { label: "Ropa ligera y traje de baño", category: "clothing" },
    { label: "Protector solar", category: "toiletries" },
    { label: "Gafas de sol", category: "accessories" },
  ],
  fall: [
    { label: "Chaqueta intermedia", category: "clothing" },
    { label: "Paraguas", category: "accessories" },
  ],
};

function seasonFor(date: Date): "winter" | "spring" | "summer" | "fall" {
  const month = date.getMonth();
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "fall";
}

function buildSmartPackingList(trip: { startDate: Date | null; endDate: Date | null }) {
  const items = [...SMART_BASE_ITEMS];
  if (trip.startDate) items.push(...SMART_SEASON_ITEMS[seasonFor(trip.startDate)]);

  let days = 3; // sensible default before the trip has real dates yet
  if (trip.startDate && trip.endDate) {
    const diffDays = Math.round((trip.endDate.getTime() - trip.startDate.getTime()) / 86400000);
    days = Math.max(1, diffDays + 1);
  }
  items.push({ label: `Ropa interior (x${days})`, category: "clothing" });
  items.push({ label: `Calcetines (x${days})`, category: "clothing" });
  items.push({ label: "Pijama", category: "clothing" });

  return items;
}

// Year in Travel (Fase 3, Milestone 5, Club-only) — built from Trip +
// JournalEntry only, both of which have real structured dates. The
// customer.travel_log metafield (Mi Pasaporte) has free-text dates
// ("date_visited" like "Summer 2023"), so it's deliberately not
// cross-referenced here rather than guessing at a parse.
type YearTripInput = { destination: string | null; startDate: Date | null; endDate: Date | null };
type YearJournalInput = { entryDate: Date | null; createdAt: Date };

function buildYearInTravel(trips: YearTripInput[], journalEntries: YearJournalInput[], year: number) {
  const tripsInYear = trips.filter((t) => t.startDate && t.startDate.getFullYear() === year);
  const destinations = Array.from(
    new Set(
      tripsInYear
        .map((t) => (t.destination || "").trim())
        .filter((d) => d.length > 0),
    ),
  );
  const totalDays = tripsInYear.reduce((sum, t) => {
    if (!t.startDate || !t.endDate) return sum;
    const diffDays = Math.round((t.endDate.getTime() - t.startDate.getTime()) / 86400000);
    return sum + Math.max(1, diffDays + 1);
  }, 0);
  const journalEntriesCount = journalEntries.filter((e) => {
    const effectiveDate = e.entryDate || e.createdAt;
    return effectiveDate.getFullYear() === year;
  }).length;

  return {
    year,
    tripsCount: tripsInYear.length,
    destinations,
    totalDays,
    journalEntriesCount,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return Response.json({ error: "Invalid proxy request" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // Community reads are public by design (Fase 3 Milestone 6) — Shopify
  // still signs/proxies this request either way, but unlike every other
  // branch below, these don't require logged_in_customer_id. Only
  // status:"published" rows are ever returned here; flagged/removed stay
  // invisible to this public branch regardless of who's asking.
  if (searchParams.get("community") === "questions") {
    const questions = await db.communityQuestion.findMany({
      where: { shop: session.shop, status: "published" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        answers: { where: { status: "published" }, orderBy: { createdAt: "asc" } },
      },
    });
    return Response.json({ questions });
  }
  if (searchParams.get("community") === "recommendations") {
    const recommendations = await db.communityRecommendation.findMany({
      where: { shop: session.shop, status: "published" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return Response.json({ recommendations });
  }

  const customerId = getCustomerId(request);
  if (!customerId) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const tripId = searchParams.get("tripId");

  // Fase 4, RODI Services. Open to any signed-in customer, no Club gate —
  // explicitly never returns internalNote (admin-only, see
  // app.service-inquiries.tsx).
  if (searchParams.get("services")) {
    const inquiries = await db.serviceInquiry.findMany({
      where: { shop: session.shop, customerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        serviceType: true,
        tripId: true,
        status: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return Response.json({ inquiries });
  }

  // Member-level data that isn't scoped to any single trip: emergency
  // contacts and documents like a passport that outlive one trip (Modo
  // emergencia, Alertas de vencimiento).
  if (searchParams.get("personal")) {
    const [emergencyContacts, documents] = await Promise.all([
      db.emergencyContact.findMany({
        where: { shop: session.shop, customerId },
        orderBy: { sortOrder: "asc" },
      }),
      db.document.findMany({
        where: { shop: session.shop, customerId, tripId: null },
        orderBy: { sortOrder: "asc" },
      }),
    ]);
    return Response.json({ emergencyContacts, documents });
  }

  if (searchParams.get("journal")) {
    const membership = await resolveMembership(session.shop, customerId);
    if (!membership.isClub) {
      return Response.json({ error: "CLUB_ONLY", feature: "journal" }, { status: 403 });
    }
    const entries = await db.journalEntry.findMany({
      where: { shop: session.shop, customerId },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      include: { trip: { select: { id: true, title: true } } },
    });
    return Response.json({ entries });
  }

  if (searchParams.get("yearInTravel")) {
    const membership = await resolveMembership(session.shop, customerId);
    if (!membership.isClub) {
      return Response.json({ error: "CLUB_ONLY", feature: "year_in_travel" }, { status: 403 });
    }
    const year = Number(searchParams.get("year")) || new Date().getFullYear();
    const [trips, journalEntries] = await Promise.all([
      db.trip.findMany({
        where: { shop: session.shop, customerId },
        select: { destination: true, startDate: true, endDate: true },
      }),
      db.journalEntry.findMany({
        where: { shop: session.shop, customerId },
        select: { entryDate: true, createdAt: true },
      }),
    ]);
    return Response.json(buildYearInTravel(trips, journalEntries, year));
  }

  if (tripId && searchParams.get("readiness")) {
    const trip = await db.trip.findFirst({
      where: { id: tripId, shop: session.shop, customerId },
      include: {
        days: { include: { activities: true } },
        checklist: true,
        documents: true,
      },
    });
    if (!trip) return Response.json({ error: "Not found" }, { status: 404 });
    const { score, buckets } = computeReadiness(trip);
    const membership = await resolveMembership(session.shop, customerId);
    if (!membership.isClub) {
      return Response.json({ score });
    }
    const recommendations = buckets.filter((b) => b.ratio < 1).map((b) => b.key);
    return Response.json({ score, buckets, recommendations });
  }

  if (tripId) {
    const trip = await db.trip.findFirst({
      where: { id: tripId, shop: session.shop, customerId },
      include: {
        days: { orderBy: { sortOrder: "asc" }, include: { activities: { orderBy: { sortOrder: "asc" } } } },
        checklist: { orderBy: { sortOrder: "asc" } },
        expenses: { orderBy: { createdAt: "desc" } },
        documents: { orderBy: { sortOrder: "asc" } },
        participants: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!trip) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ trip });
  }

  const trips = await db.trip.findMany({
    where: { shop: session.shop, customerId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { checklist: true } } },
  });
  return Response.json({ trips });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const customerId = getCustomerId(request);
  if (!session || !customerId) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  const shop = session.shop;
  const membership = await resolveMembership(shop, customerId);

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { op } = body;

  switch (op) {
    case "createTrip": {
      if (!membership.isClub) {
        const existingCount = await db.trip.count({ where: { shop, customerId } });
        if (existingCount >= FREE_TRIP_LIMIT) {
          return Response.json({ error: "FREE_TRIP_LIMIT", limit: FREE_TRIP_LIMIT }, { status: 403 });
        }
      }
      const trip = await db.trip.create({
        data: {
          shop,
          customerId,
          title: String(body.title ?? "Nuevo viaje"),
          destination: body.destination ?? null,
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
        },
      });
      return Response.json({ trip });
    }

    case "updateTrip": {
      await assertTripOwnership(body.tripId, shop, customerId);
      const trip = await db.trip.update({
        where: { id: body.tripId },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.destination !== undefined ? { destination: body.destination } : {}),
          ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(body.startDate) : null } : {}),
          ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.budgetTotal !== undefined
            ? { budgetTotal: body.budgetTotal === null || body.budgetTotal === "" ? null : Number(body.budgetTotal) }
            : {}),
          ...(body.budgetCurrency !== undefined ? { budgetCurrency: body.budgetCurrency } : {}),
        },
      });
      return Response.json({ trip });
    }

    case "deleteTrip": {
      await assertTripOwnership(body.tripId, shop, customerId);
      await db.trip.delete({ where: { id: body.tripId } });
      return Response.json({ ok: true });
    }

    case "createDay": {
      await assertTripOwnership(body.tripId, shop, customerId);
      const count = await db.day.count({ where: { tripId: body.tripId } });
      const day = await db.day.create({
        data: {
          tripId: body.tripId,
          date: new Date(body.date),
          title: body.title ?? null,
          sortOrder: count,
        },
      });
      return Response.json({ day });
    }

    case "updateDay": {
      const day = await db.day.findUnique({ where: { id: body.dayId }, include: { trip: true } });
      if (!day || day.trip.shop !== shop || day.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      const updated = await db.day.update({
        where: { id: body.dayId },
        data: {
          ...(body.date !== undefined ? { date: new Date(body.date) } : {}),
          ...(body.title !== undefined ? { title: body.title } : {}),
        },
      });
      return Response.json({ day: updated });
    }

    case "deleteDay": {
      const day = await db.day.findUnique({ where: { id: body.dayId }, include: { trip: true } });
      if (!day || day.trip.shop !== shop || day.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      await db.day.delete({ where: { id: body.dayId } });
      return Response.json({ ok: true });
    }

    case "createActivity": {
      const day = await db.day.findUnique({ where: { id: body.dayId }, include: { trip: true } });
      if (!day || day.trip.shop !== shop || day.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (!membership.isClub) {
        const tripActivityCount = await db.activity.count({ where: { day: { tripId: day.tripId } } });
        if (tripActivityCount >= FREE_TIMELINE_ACTIVITY_LIMIT) {
          return Response.json(
            { error: "FREE_TIMELINE_LIMIT", limit: FREE_TIMELINE_ACTIVITY_LIMIT },
            { status: 403 },
          );
        }
      }
      const count = await db.activity.count({ where: { dayId: body.dayId } });
      const activity = await db.activity.create({
        data: {
          dayId: body.dayId,
          time: body.time ?? null,
          title: String(body.title ?? "Actividad"),
          category: body.category ?? null,
          location: body.location ?? null,
          imageUrl: body.imageUrl ?? null,
          sortOrder: count,
        },
      });
      return Response.json({ activity });
    }

    case "updateActivity": {
      const activity = await db.activity.findUnique({
        where: { id: body.activityId },
        include: { day: { include: { trip: true } } },
      });
      if (!activity || activity.day.trip.shop !== shop || activity.day.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      const updated = await db.activity.update({
        where: { id: body.activityId },
        data: {
          ...(body.time !== undefined ? { time: body.time } : {}),
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.location !== undefined ? { location: body.location } : {}),
          ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        },
      });
      return Response.json({ activity: updated });
    }

    case "deleteActivity": {
      const activity = await db.activity.findUnique({
        where: { id: body.activityId },
        include: { day: { include: { trip: true } } },
      });
      if (!activity || activity.day.trip.shop !== shop || activity.day.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      await db.activity.delete({ where: { id: body.activityId } });
      return Response.json({ ok: true });
    }

    case "createChecklistItem": {
      await assertTripOwnership(body.tripId, shop, customerId);
      const count = await db.checklistItem.count({ where: { tripId: body.tripId } });
      const item = await db.checklistItem.create({
        data: {
          tripId: body.tripId,
          label: String(body.label ?? ""),
          category: body.category ?? null,
          sortOrder: count,
        },
      });
      return Response.json({ item });
    }

    case "toggleChecklistItem": {
      const item = await db.checklistItem.findUnique({ where: { id: body.itemId }, include: { trip: true } });
      if (!item || item.trip.shop !== shop || item.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      const updated = await db.checklistItem.update({
        where: { id: body.itemId },
        data: { done: body.done !== undefined ? Boolean(body.done) : !item.done },
      });
      return Response.json({ item: updated });
    }

    case "deleteChecklistItem": {
      const item = await db.checklistItem.findUnique({ where: { id: body.itemId }, include: { trip: true } });
      if (!item || item.trip.shop !== shop || item.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      await db.checklistItem.delete({ where: { id: body.itemId } });
      return Response.json({ ok: true });
    }

    case "generateSmartPacking": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "smart_packing" }, { status: 403 });
      }
      const trip = await assertTripOwnership(body.tripId, shop, customerId);
      // Regenerating only ever touches items this generator made itself
      // (source:"smart") — never the default template or anything the
      // customer typed in by hand.
      await db.checklistItem.deleteMany({ where: { tripId: trip.id, source: "smart" } });
      const items = buildSmartPackingList(trip);
      await db.checklistItem.createMany({
        data: items.map((item, i) => ({
          tripId: trip.id,
          label: item.label,
          category: item.category,
          source: "smart",
          sortOrder: 1000 + i,
        })),
      });
      const checklist = await db.checklistItem.findMany({
        where: { tripId: trip.id },
        orderBy: { sortOrder: "asc" },
      });
      return Response.json({ checklist });
    }

    case "createExpense": {
      await assertTripOwnership(body.tripId, shop, customerId);
      const amount = Number(body.amount);
      if (!Number.isFinite(amount)) {
        return Response.json({ error: "Invalid amount" }, { status: 400 });
      }
      // Defaults to "budget" for callers that haven't been updated to pass
      // kind explicitly yet — matches the column's own default, so this is
      // never a behavior change for Budget, only an enabler for Split.
      const kind = body.kind === "split" ? "split" : "budget";
      if (!membership.isClub) {
        if (kind === "split") {
          return Response.json({ error: "CLUB_ONLY", feature: "split" }, { status: 403 });
        }
        const budgetExpenseCount = await db.expense.count({ where: { tripId: body.tripId, kind: "budget" } });
        if (budgetExpenseCount >= FREE_BUDGET_EXPENSE_LIMIT) {
          return Response.json(
            { error: "FREE_BUDGET_LIMIT", limit: FREE_BUDGET_EXPENSE_LIMIT },
            { status: 403 },
          );
        }
      }
      const expense = await db.expense.create({
        data: {
          tripId: body.tripId,
          kind,
          category: body.category ?? "otros",
          label: String(body.label ?? ""),
          amount,
          date: body.date ? new Date(body.date) : null,
          paidById: body.paidById ?? null,
        },
      });
      return Response.json({ expense });
    }

    case "updateExpense": {
      const expense = await db.expense.findUnique({ where: { id: body.expenseId }, include: { trip: true } });
      if (!expense || expense.trip.shop !== shop || expense.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      const updated = await db.expense.update({
        where: { id: body.expenseId },
        data: {
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.label !== undefined ? { label: body.label } : {}),
          ...(body.amount !== undefined ? { amount: Number(body.amount) } : {}),
          ...(body.date !== undefined ? { date: body.date ? new Date(body.date) : null } : {}),
          ...(body.paidById !== undefined ? { paidById: body.paidById } : {}),
        },
      });
      return Response.json({ expense: updated });
    }

    case "deleteExpense": {
      const expense = await db.expense.findUnique({ where: { id: body.expenseId }, include: { trip: true } });
      if (!expense || expense.trip.shop !== shop || expense.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      await db.expense.delete({ where: { id: body.expenseId } });
      return Response.json({ ok: true });
    }

    case "createParticipant": {
      // Participants exist only to attribute Split expenses to someone —
      // Split itself is Club-only, so there's no Free use case for this op.
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "split" }, { status: 403 });
      }
      await assertTripOwnership(body.tripId, shop, customerId);
      const name = String(body.name ?? "").trim();
      if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
      const count = await db.participant.count({ where: { tripId: body.tripId } });
      const participant = await db.participant.create({
        data: { tripId: body.tripId, name, sortOrder: count },
      });
      return Response.json({ participant });
    }

    case "deleteParticipant": {
      const participant = await db.participant.findUnique({
        where: { id: body.participantId },
        include: { trip: true },
      });
      if (!participant || participant.trip.shop !== shop || participant.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      await db.participant.delete({ where: { id: body.participantId } });
      return Response.json({ ok: true });
    }

    case "createDocument": {
      // tripId is optional: set it for a trip-specific document (e.g. a
      // hotel reservation), omit it for a member-level one that outlives
      // any single trip (e.g. a passport, shown on Alertas de vencimiento).
      // Only the member-level (Alertas) branch is Club-only — trip-scoped
      // documents stay available to Free.
      if (!body.tripId && !membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "alerts" }, { status: 403 });
      }
      if (body.tripId) await assertTripOwnership(body.tripId, shop, customerId);
      const title = String(body.title ?? "").trim();
      if (!title) {
        return Response.json({ error: "Title is required" }, { status: 400 });
      }
      const url = body.url ? String(body.url).trim() : null;
      if (url && !/^https?:\/\//i.test(url)) {
        return Response.json({ error: "Invalid URL" }, { status: 400 });
      }
      const count = await db.document.count({
        where: body.tripId ? { tripId: body.tripId } : { shop, customerId, tripId: null },
      });
      const document = await db.document.create({
        data: {
          shop,
          customerId,
          tripId: body.tripId ?? null,
          title,
          category: body.category ?? "otro",
          url,
          note: body.note ?? null,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          sortOrder: count,
        },
      });
      return Response.json({ document });
    }

    case "updateDocument": {
      const document = await db.document.findFirst({
        where: { id: body.documentId, shop, customerId },
      });
      if (!document) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      if (body.url) {
        const url = String(body.url).trim();
        if (!/^https?:\/\//i.test(url)) {
          return Response.json({ error: "Invalid URL" }, { status: 400 });
        }
      }
      const updated = await db.document.update({
        where: { id: body.documentId },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.url !== undefined ? { url: body.url ? String(body.url).trim() : null } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
          ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } : {}),
        },
      });
      return Response.json({ document: updated });
    }

    case "deleteDocument": {
      const document = await db.document.findFirst({
        where: { id: body.documentId, shop, customerId },
      });
      if (!document) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      await db.document.delete({ where: { id: body.documentId } });
      return Response.json({ ok: true });
    }

    case "createEmergencyContact": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "emergency" }, { status: 403 });
      }
      const name = String(body.name ?? "").trim();
      if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
      const count = await db.emergencyContact.count({ where: { shop, customerId } });
      const contact = await db.emergencyContact.create({
        data: {
          shop,
          customerId,
          name,
          phone: body.phone ?? null,
          note: body.note ?? null,
          sortOrder: count,
        },
      });
      return Response.json({ contact });
    }

    case "updateEmergencyContact": {
      const contact = await db.emergencyContact.findFirst({
        where: { id: body.contactId, shop, customerId },
      });
      if (!contact) return Response.json({ error: "Not found" }, { status: 404 });
      const updated = await db.emergencyContact.update({
        where: { id: body.contactId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
        },
      });
      return Response.json({ contact: updated });
    }

    case "deleteEmergencyContact": {
      const contact = await db.emergencyContact.findFirst({
        where: { id: body.contactId, shop, customerId },
      });
      if (!contact) return Response.json({ error: "Not found" }, { status: 404 });
      await db.emergencyContact.delete({ where: { id: body.contactId } });
      return Response.json({ ok: true });
    }

    case "createJournalEntry": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "journal" }, { status: 403 });
      }
      const bodyText = String(body.body ?? "").trim();
      if (!bodyText) return Response.json({ error: "Body is required" }, { status: 400 });
      if (body.tripId) await assertTripOwnership(body.tripId, shop, customerId);
      const entry = await db.journalEntry.create({
        data: {
          shop,
          customerId,
          tripId: body.tripId || null,
          countryHandle: body.countryHandle || null,
          title: body.title || null,
          body: bodyText,
          photoUrl: body.photoUrl || null,
          entryDate: body.entryDate ? new Date(body.entryDate) : null,
        },
      });
      return Response.json({ entry });
    }

    case "updateJournalEntry": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "journal" }, { status: 403 });
      }
      const entry = await db.journalEntry.findFirst({ where: { id: body.entryId, shop, customerId } });
      if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
      if (body.tripId) await assertTripOwnership(body.tripId, shop, customerId);
      const updated = await db.journalEntry.update({
        where: { id: body.entryId },
        data: {
          ...(body.tripId !== undefined ? { tripId: body.tripId || null } : {}),
          ...(body.countryHandle !== undefined ? { countryHandle: body.countryHandle || null } : {}),
          ...(body.title !== undefined ? { title: body.title || null } : {}),
          ...(body.body !== undefined ? { body: String(body.body) } : {}),
          ...(body.photoUrl !== undefined ? { photoUrl: body.photoUrl || null } : {}),
          ...(body.entryDate !== undefined ? { entryDate: body.entryDate ? new Date(body.entryDate) : null } : {}),
        },
      });
      return Response.json({ entry: updated });
    }

    case "deleteJournalEntry": {
      const entry = await db.journalEntry.findFirst({ where: { id: body.entryId, shop, customerId } });
      if (!entry) return Response.json({ error: "Not found" }, { status: 404 });
      await db.journalEntry.delete({ where: { id: body.entryId } });
      return Response.json({ ok: true });
    }

    case "createCommunityQuestion": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "community" }, { status: 403 });
      }
      const title = String(body.title ?? "").trim();
      const bodyText = String(body.body ?? "").trim();
      if (!title || !bodyText) {
        return Response.json({ error: "Title and body are required" }, { status: 400 });
      }
      const authorName = String(body.authorName ?? "").trim().slice(0, 80) || "RODI member";
      const question = await db.communityQuestion.create({
        data: { shop, customerId, authorName, title, body: bodyText },
      });
      return Response.json({ question });
    }

    case "createCommunityAnswer": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "community" }, { status: 403 });
      }
      const bodyText = String(body.body ?? "").trim();
      if (!bodyText) return Response.json({ error: "Body is required" }, { status: 400 });
      const question = await db.communityQuestion.findFirst({ where: { id: body.questionId, shop } });
      if (!question) return Response.json({ error: "Not found" }, { status: 404 });
      const authorName = String(body.authorName ?? "").trim().slice(0, 80) || "RODI member";
      const answer = await db.communityAnswer.create({
        data: { shop, customerId, questionId: body.questionId, authorName, body: bodyText },
      });
      return Response.json({ answer });
    }

    case "createCommunityRecommendation": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "community" }, { status: 403 });
      }
      const title = String(body.title ?? "").trim();
      const bodyText = String(body.body ?? "").trim();
      if (!title || !bodyText) {
        return Response.json({ error: "Title and body are required" }, { status: 400 });
      }
      const authorName = String(body.authorName ?? "").trim().slice(0, 80) || "RODI member";
      const recommendation = await db.communityRecommendation.create({
        data: {
          shop,
          customerId,
          authorName,
          title,
          body: bodyText,
          category: body.category || null,
          city: body.city || null,
        },
      });
      return Response.json({ recommendation });
    }

    case "createServiceInquiry": {
      // No membership.isClub check — RODI Services is open to any
      // signed-in customer, Free or Club, same as the original spec's
      // "one-time paid add-on" framing (not a membership perk).
      const serviceType = String(body.serviceType ?? "").trim();
      if (!serviceType) return Response.json({ error: "serviceType is required" }, { status: 400 });
      if (body.tripId) await assertTripOwnership(body.tripId, shop, customerId);
      const inquiry = await db.serviceInquiry.create({
        data: {
          shop,
          customerId,
          serviceType,
          tripId: body.tripId || null,
          notes: body.notes || null,
        },
        select: {
          id: true,
          serviceType: true,
          tripId: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return Response.json({ inquiry });
    }

    default:
      return Response.json({ error: `Unknown op: ${op}` }, { status: 400 });
  }
};
