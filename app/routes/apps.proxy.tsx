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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const customerId = getCustomerId(request);
  if (!session || !customerId) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("tripId");

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

    default:
      return Response.json({ error: `Unknown op: ${op}` }, { status: 400 });
  }
};
