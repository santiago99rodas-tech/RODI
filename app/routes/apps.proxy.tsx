import { checkWords, moderate } from "../moderation.server";
import { cleanEmail, cleanPhone, cleanSplitWith } from "../split.server";
import {
  CommunityFailure, acceptReply as acceptCommunityReply, createPost as createCommunityPost, createReply as createCommunityReply, feed as communityFeed,
  meta as communityMeta, removeOwn as removeOwnCommunity, report as reportCommunity, thread as communityThread, toggleLike as toggleCommunityLike,
} from "../community.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { saveReport } from "../place-report.server";
import { estimateJourney } from "../journey.server";
import { aiAllowance, aiItineraryEnabled, aiLeft, aiRefund, aiRegister, planWithAi, sanitizeAiRequest } from "../ai-itinerary.server";
import { claimReferral, qualifyReferral, referralSummary } from "../referral.server";
import { JournalFailure, addPhoto, getPhoto, pruneUnusedPhotos, readBook, saveCover, savePage } from "../journal-book.server";
import { resolveMembership } from "../membership.server";
import { saveNationalities } from "../nationality.server";
import { readProfileGate, sanitizeResidence, saveResidence } from "../profile-gate.server";
import { SavedCountriesFailure, setCountrySaved, topFavorites } from "../saved-countries.server";
import { TravelLogFailure, setTravelEntry } from "../travel-log.server";
import {
  CALC_CLUB_PLAN_LIMIT, CALC_FREE_PLAN_LIMIT, PANEL_LABELS, budgetCategory, computeTotals, sanitizePlan,
} from "../calc-plan.server";
import {
  AccountFailure, deleteAddress, provinceList, readAccount, sanitizeAddress, sanitizeAddressId, sanitizeProfile, saveAddress, setDefaultAddress,
  setEmailMarketing, updateProfile,
} from "../account.server";
import { popularCountries, syncTravelStats } from "../country-popularity.server";
import { sanitizeWizard } from "../trip-wizard.server";
import { PACK_KEY, packingRatio, parsePackPrefs, sanitizePackPrefs } from "../pack.server";
import {
  MAP_IMPORT_BATCH, MAP_PLACE_LIMIT, MAP_STATUSES, ROUTE_POINTS_MAX, allowRoute, allowSearch, cleanPlace, geocodeNames, isDuplicate, moveMapPlace, reindexDay, reversePlace, roomLeft, routeLegs, searchPlaces, suggestPlaces,
} from "../route-map.server";
import { CLUB_NATIONALITY_LIMIT, FREE_NATIONALITY_LIMIT, NATIONALITIES, NATIONALITY_NAMES } from "../nationalities";
import { acceptLegal, clientIp, clientUserAgent, getLegalState, resendGuardian } from "../legal.server";
import { buildCustomerExport, deleteAccountAsMember, exportFilename } from "../privacy.server";

// Legal gate (see app/legal.server.ts). While a member is restricted (documents not accepted for the current versions,
// under 15, or a 15-17 member without an approved guardian) every write is refused except these, which they need to get
// out of that state or to exercise their privacy rights.
const LEGAL_EXEMPT_OPS = new Set(["legalAccept", "guardianResend", "accountExport", "accountDelete", "updateAccount"]);
// Minors (even with guardian approval) can read the community but not publish in it.
const MINOR_READ_ONLY_OPS = new Set([
  "communityPostCreate", "communityReplyCreate", "createCommunityQuestion", "createCommunityAnswer", "createCommunityRecommendation",
]);

function exportResponse(data: unknown) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename()}"`,
      "Cache-Control": "no-store",
    },
  });
}

// Fase 3 Free-tier limits. Not configurable from Admin yet (no admin UI
// exists in this app) — change these constants and redeploy if they need
// to move.
const FREE_TRIP_LIMIT = 1;
const FREE_TIMELINE_ACTIVITY_LIMIT = 5;
// The activities RODI suggests (and the hotel of each night) are free of the limit above, but the "suggested" mark comes from the page,
// so a Free member could also send it on their own entries. These ceilings keep that from being a way around the limit:
// a Free trip has at most FREE_DAYS_PER_TRIP days and FREE_SUGGESTED_PER_DAY suggested activities per day (plus some slack).
const FREE_DAYS_PER_TRIP = 62;
const FREE_SUGGESTED_PER_DAY = 10;
const FREE_SUGGESTED_SLACK = 10;
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

// Route map (Club). A stop on the map is an Activity with coordinates; a place saved but not yet in a day is a TripPlace.
// Both count toward the same per-trip cap.
type MapCountTx = Pick<typeof db, "activity" | "tripPlace">;

function clubOnlyMap() {
  return Response.json({ error: "CLUB_ONLY", feature: "route_map" }, { status: 403 });
}

async function mapPlaceCount(tx: MapCountTx, tripId: string) {
  const [a, p] = await Promise.all([
    tx.activity.count({ where: { day: { tripId }, lat: { not: null } } }),
    tx.tripPlace.count({ where: { tripId } }),
  ]);
  return a + p;
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
  packPrefs?: string | null;
  checklist: { done: boolean; key?: string | null; source?: string | null; category?: string | null }[];
  days: { activities: { id: string }[] }[];
};

function computeReadiness(trip: ReadinessTripInput) {
  const buckets = [
    { key: "dates", weight: 20, ratio: trip.startDate && trip.endDate ? 1 : 0 },
    { key: "documents", weight: 20, ratio: Math.min(trip.documents.length / 2, 1) },
    {
      key: "packing",
      weight: 25,
      ratio: packingRatio(parsePackPrefs(trip.packPrefs), trip.checklist),
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
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session) {
    return Response.json({ error: "Invalid proxy request" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // Community reads are public by design (Fase 3 Milestone 6) — Shopify
  // still signs/proxies this request either way, but unlike every other
  // branch below, these don't require logged_in_customer_id. Only
  // status:"published" rows are ever returned here; flagged/removed stay
  // invisible to this public branch regardless of who's asking.
  if (searchParams.get("community") === "feed" || searchParams.get("community") === "meta" || searchParams.get("community") === "thread") {
    try {
      const viewer = getCustomerId(request);
      const what = searchParams.get("community");
      if (what === "meta") return Response.json(await communityMeta(session.shop));
      if (what === "thread") {
        const t = await communityThread(session.shop, viewer, String(searchParams.get("id") ?? ""));
        return t ? Response.json(t) : Response.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      return Response.json(await communityFeed(session.shop, viewer, {
        type: searchParams.get("type") ?? undefined, country: searchParams.get("country") ?? undefined, topic: searchParams.get("topic") ?? undefined,
        tag: searchParams.get("tag") ?? undefined, q: searchParams.get("q") ?? undefined, sort: searchParams.get("sort") ?? undefined,
        page: Number(searchParams.get("page") ?? 1), mine: searchParams.get("mine") === "1",
      }));
    } catch (err) {
      console.error("community read failed", err);
      return Response.json({ error: "COMMUNITY_UNAVAILABLE" }, { status: 502 });
    }
  }
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

  // Where members are going (saves + passport), public counts only. Used by the Home when enough members have taken part.
  if (searchParams.get("popular") !== null) {
    try {
      return Response.json(await popularCountries(session.shop));
    } catch (err) {
      console.error("popularCountries failed", err);
      return Response.json({ members: 0, countries: [] });
    }
  }

  // Member favorites ranking is public too: only per-country save counts, never who saved what.
  if (searchParams.get("favorites")) {
    return Response.json({ favorites: await topFavorites(session.shop) });
  }

  // Legal gate state. Answers for signed-out visitors too (loggedIn:false), so the theme can call it unconditionally.
  if (searchParams.get("legal") !== null) {
    return Response.json(await getLegalState(session.shop, getCustomerId(request)), { headers: { "Cache-Control": "no-store" } });
  }

  const customerId = getCustomerId(request);
  if (!customerId) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }

  // "Descargar mis datos": everything the app stores about the member, as a file (plain link with the download attribute).
  if (searchParams.get("export") === "all") {
    return exportResponse(await buildCustomerExport(session.shop, customerId, { admin }));
  }

  // Profile step of the Club gate: what is still missing (name, mobile, nationality, where they live) and the country list for the pickers.
  if (searchParams.get("profileGate") !== null) {
    if (!admin) return Response.json({ error: "ACCOUNT_UNAVAILABLE" }, { status: 503 });
    try {
      const membership = await resolveMembership(session.shop, customerId);
      const state = await readProfileGate(admin, customerId);
      return Response.json({ ...state, countries: NATIONALITIES, nationalityLimit: membership.isClub ? CLUB_NATIONALITY_LIMIT : FREE_NATIONALITY_LIMIT }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      console.error("readProfileGate failed", err);
      return Response.json({ error: "ACCOUNT_UNAVAILABLE" }, { status: 502 });
    }
  }

  // "Mi cuenta": the signed-in customer's own details, read from Shopify, plus the province lists the address form needs.
  if (searchParams.get("account") !== null) {
    if (!admin) return Response.json({ error: "ACCOUNT_UNAVAILABLE" }, { status: 503 });
    try {
      const account = await readAccount(admin, customerId);
      return Response.json({ account, provinces: searchParams.get("provinces") !== null ? provinceList() : undefined });
    } catch (err) {
      console.error("readAccount failed", err);
      return Response.json({ error: "ACCOUNT_UNAVAILABLE" }, { status: 502 });
    }
  }

  const tripId = searchParams.get("tripId");

  // Refer a friend: the member's invitation code, share link and what it has earned. Open to any signed-in member.
  if (searchParams.get("referral")) {
    return Response.json(await referralSummary(session.shop, customerId));
  }

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

  // Trip cost calculator plans. Open to any signed-in member; how many they
  // can keep depends on membership (see CALC_*_PLAN_LIMIT).
  if (searchParams.get("calcPlans")) {
    const membership = await resolveMembership(session.shop, customerId);
    const plans = await db.calculatorPlan.findMany({
      where: { shop: session.shop, customerId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, currency: true, total: true, tripId: true, updatedAt: true },
    });
    return Response.json({ plans, limit: membership.isClub ? CALC_CLUB_PLAN_LIMIT : CALC_FREE_PLAN_LIMIT });
  }

  if (searchParams.get("calcPlan")) {
    const plan = await db.calculatorPlan.findFirst({
      where: { id: searchParams.get("calcPlan")!, shop: session.shop, customerId },
    });
    if (!plan) return Response.json({ error: "Not found" }, { status: 404 });
    let data: unknown = null;
    try { data = JSON.parse(plan.data); } catch { /* stored data is always written by sanitizePlan */ }
    return Response.json({
      plan: { id: plan.id, name: plan.name, currency: plan.currency, total: plan.total, tripId: plan.tripId, updatedAt: plan.updatedAt, data },
    });
  }

  // Journal book (Club): the member's pages, their visited countries and photo quota; one photo's bytes (own only).
  if (searchParams.get("journalBook") || searchParams.get("journalPhoto")) {
    const membership = await resolveMembership(session.shop, customerId);
    if (!membership.isClub) {
      return Response.json({ error: "CLUB_ONLY", feature: "journal" }, { status: 403 });
    }
    const photoId = searchParams.get("journalPhoto");
    if (photoId) {
      const photo = await getPhoto(session.shop, customerId, photoId);
      if (!photo) return new Response("Not found", { status: 404 });
      return new Response(photo.bytes, {
        headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=86400", "Content-Length": String(photo.size), "X-Content-Type-Options": "nosniff" },
      });
    }
    return Response.json(await readBook(session.shop, customerId));
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

  // Can this member personalize a route with the AI step? (Club only, and only when the shop turned it on.)
  if (searchParams.get("aiItinerary") !== null) {
    const membership = await resolveMembership(session.shop, customerId);
    const enabled = aiItineraryEnabled() && membership.isClub;
    return Response.json({ enabled, left: enabled ? aiLeft(customerId) : 0 });
  }

  // Approximate duration of a journey between two cities (straight-line distance, per mode). Open to any signed-in member, Free or Club.
  if (searchParams.get("journeyEstimate") !== null) {
    if (!allowSearch(customerId)) return Response.json({ error: "RATE_LIMIT" }, { status: 429 });
    try {
      return Response.json(await estimateJourney(searchParams.get("from") || "", searchParams.get("to") || ""));
    } catch {
      return Response.json({ ok: false, error: "UNAVAILABLE" }, { status: 502 });
    }
  }

  if (searchParams.get("mapSearch") !== null) {
    const membership = await resolveMembership(session.shop, customerId);
    if (!membership.isClub) return clubOnlyMap();
    if (!allowSearch(customerId)) return Response.json({ error: "RATE_LIMIT" }, { status: 429 });
    const lat = Number(searchParams.get("lat")), lon = Number(searchParams.get("lon"));
    try {
      const find = searchParams.get("mode") === "search" ? searchPlaces : suggestPlaces;
      const hits = await find(searchParams.get("mapSearch") || "", {
        lat: searchParams.get("lat") !== null && Number.isFinite(lat) ? lat : undefined,
        lon: searchParams.get("lon") !== null && Number.isFinite(lon) ? lon : undefined,
        lang: searchParams.get("lang") || undefined,
      });
      return Response.json({ hits });
    } catch {
      return Response.json({ hits: [], error: "SEARCH_UNAVAILABLE" }, { status: 502 });
    }
  }

  if (searchParams.get("mapReverse") !== null) {
    const membership = await resolveMembership(session.shop, customerId);
    if (!membership.isClub) return clubOnlyMap();
    if (!allowSearch(customerId)) return Response.json({ error: "RATE_LIMIT" }, { status: 429 });
    try {
      const hit = await reversePlace(Number(searchParams.get("lat")), Number(searchParams.get("lon")), searchParams.get("lang") || undefined);
      return Response.json({ hit });
    } catch {
      return Response.json({ hit: null, error: "SEARCH_UNAVAILABLE" }, { status: 502 });
    }
  }

  if (searchParams.get("mapRoute") !== null) {
    const membership = await resolveMembership(session.shop, customerId);
    if (!membership.isClub) return clubOnlyMap();
    const profile = searchParams.get("profile") === "car" ? "car" : "foot";
    const pts = (searchParams.get("pts") || "").split(";").filter(Boolean).map((p) => {
      const [lat, lng] = p.split(",").map(Number);
      return { lat, lng };
    });
    if (pts.length < 2 || pts.length > ROUTE_POINTS_MAX || pts.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) {
      return Response.json({ error: "BAD_POINTS" }, { status: 400 });
    }
    if (!allowRoute(customerId)) return Response.json({ error: "RATE_LIMIT" }, { status: 429 });
    try {
      return Response.json(await routeLegs(pts, profile));
    } catch {
      return Response.json({ error: "ROUTE_UNAVAILABLE" }, { status: 502 });
    }
  }

  if (tripId && searchParams.get("routemap")) {
    const membership = await resolveMembership(session.shop, customerId);
    if (!membership.isClub) return clubOnlyMap();
    const trip = await db.trip.findFirst({
      where: { id: tripId, shop: session.shop, customerId },
      select: {
        id: true, title: true, destination: true, startDate: true, endDate: true,
        days: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true, date: true, title: true, sortOrder: true,
            activities: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true, category: true, location: true, note: true, lat: true, lng: true, time: true, sortOrder: true } },
          },
        },
        places: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, category: true, lat: true, lng: true, note: true, status: true } },
      },
    });
    if (!trip) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ trip, limit: MAP_PLACE_LIMIT });
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
  const { session, admin } = await authenticate.public.appProxy(request);
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

  const legal = await getLegalState(shop, customerId);
  // Opting OUT of marketing is always allowed (withdrawing consent can never be blocked); opting in is not while restricted.
  const isUnsubscribe = op === "setEmailMarketing" && body.subscribed !== true;
  if (legal.restricted && !LEGAL_EXEMPT_OPS.has(op) && !isUnsubscribe) {
    return Response.json({ error: "legal_restricted" }, { status: 403 });
  }
  const isMinor = legal.ageBand === "minor" || legal.ageBand === "under_15";
  if (isMinor && MINOR_READ_ONLY_OPS.has(op)) return Response.json({ error: "minor_read_only" }, { status: 403 });
  if (isMinor && op === "setEmailMarketing" && body.subscribed === true) return Response.json({ error: "minor_marketing" }, { status: 403 });

  switch (op) {
    case "legalAccept": {
      const result = await acceptLegal(
        { shop, customerId, admin: admin ?? null, ip: clientIp(request), userAgent: clientUserAgent(request) },
        body,
      );
      if ("error" in result) return Response.json({ error: result.error }, { status: result.error === "under_15" ? 403 : 400 });
      return Response.json({ ok: true, ...(await getLegalState(shop, customerId)) });
    }

    case "guardianResend": {
      const result = await resendGuardian({ shop, customerId, admin: admin ?? null });
      if ("error" in result) return Response.json({ error: result.error, retryAfter: result.retryAfter }, { status: result.status });
      return Response.json({ ok: true });
    }

    case "accountExport":
      return exportResponse(await buildCustomerExport(shop, customerId, { admin }));

    case "accountDelete": {
      if (body.confirm !== "ELIMINAR") return Response.json({ error: "confirm_required" }, { status: 400 });
      try {
        await deleteAccountAsMember(shop, customerId, admin ?? null, session.scope);
      } catch (err) {
        console.error("accountDelete failed", err);
        return Response.json({ error: "DELETE_FAILED" }, { status: 500 });
      }
      return Response.json({ ok: true });
    }

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
          wizard: (() => { const w = sanitizeWizard(body.wizard); return w ? JSON.stringify(w) : null; })(),
        },
      });
      const referralMonths = await qualifyReferral(admin ?? null, shop, customerId); // pays a pending "refer a friend" reward on a first trip
      return Response.json({ trip, ...(referralMonths ? { referralMonths } : {}) });
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
          ...(body.wizard !== undefined ? { wizard: (() => { const w = sanitizeWizard(body.wizard); return w ? JSON.stringify(w) : null; })() } : {}),
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
      if (!membership.isClub && count >= FREE_DAYS_PER_TRIP) {
        return Response.json({ error: "FREE_DAY_LIMIT", limit: FREE_DAYS_PER_TRIP }, { status: 403 });
      }
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

    // Plan-a-trip assistant: the days of a trip and the activities suggested for each one, in a single request.
    // Suggested activities are free of the Free-plan activity limit (the member only pays that limit with what they add themselves).
    case "aiItinerary": {
      if (!membership.isClub) return Response.json({ error: "CLUB_ONLY", feature: "ai_itinerary" }, { status: 403 });
      if (!aiItineraryEnabled()) return Response.json({ error: "AI_OFF" }, { status: 403 });
      const aiReq = sanitizeAiRequest(body);
      if (!aiReq) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
      const allow = aiAllowance(customerId);
      if (!allow.ok) return Response.json({ error: allow.reason }, { status: 429 });
      aiRegister(customerId);
      try {
        return Response.json({ ok: true, plan: await planWithAi(aiReq), left: aiLeft(customerId) });
      } catch {
        aiRefund(customerId); // a failed call does not use up the member's daily allowance
        return Response.json({ error: "AI_UNAVAILABLE" }, { status: 502 });
      }
    }

    case "createTripPlan": {
      await assertTripOwnership(body.tripId, shop, customerId);
      const planDays = Array.isArray(body.days) ? body.days.slice(0, 60) : [];
      const existing = await db.day.count({ where: { tripId: body.tripId } });
      if (!membership.isClub && existing + planDays.length > FREE_DAYS_PER_TRIP) {
        return Response.json({ error: "FREE_DAY_LIMIT", limit: FREE_DAYS_PER_TRIP }, { status: 403 });
      }
      // Free: the suggested activities of the trip stay under the ceiling (the plan is trimmed, never refused halfway)
      let room = membership.isClub
        ? Infinity
        : (existing + planDays.length) * FREE_SUGGESTED_PER_DAY + FREE_SUGGESTED_SLACK - (await db.activity.count({ where: { day: { tripId: body.tripId }, suggested: true } }));
      let activities = 0;
      for (let i = 0; i < planDays.length; i++) {
        const d = planDays[i] || {};
        if (!d.date) continue;
        const day = await db.day.create({
          data: { tripId: body.tripId, date: new Date(d.date), title: d.title ? String(d.title).slice(0, 120) : null, sortOrder: existing + i },
        });
        const items = Array.isArray(d.items) ? d.items.slice(0, 12) : [];
        for (let k = 0; k < items.length; k++) {
          const it = items[k] || {};
          if (!it.title) continue;
          if (room <= 0) break;
          room--;
          await db.activity.create({
            data: {
              dayId: day.id,
              time: it.time ? String(it.time).slice(0, 12) : null,
              title: String(it.title).slice(0, 140),
              category: it.category ? String(it.category).slice(0, 30) : null,
              location: it.location ? String(it.location).slice(0, 140) : null,
              note: it.note ? String(it.note).slice(0, 300) : null,
              suggested: true,
              sortOrder: k,
            },
          });
          activities++;
        }
      }
      return Response.json({ ok: true, days: planDays.length, activities });
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
      const suggestedByRodi = body.suggested === true;
      if (!membership.isClub && suggestedByRodi) {
        const [dayCount, suggestedCount] = await Promise.all([
          db.day.count({ where: { tripId: day.tripId } }),
          db.activity.count({ where: { day: { tripId: day.tripId }, suggested: true } }),
        ]);
        if (suggestedCount >= dayCount * FREE_SUGGESTED_PER_DAY + FREE_SUGGESTED_SLACK) {
          return Response.json({ error: "FREE_SUGGESTED_LIMIT", limit: dayCount * FREE_SUGGESTED_PER_DAY + FREE_SUGGESTED_SLACK }, { status: 403 });
        }
      }
      if (!membership.isClub && !suggestedByRodi) {
        const tripActivityCount = await db.activity.count({ where: { day: { tripId: day.tripId }, suggested: false } });
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
          note: body.note ? String(body.note).slice(0, 300) : null,
          suggested: suggestedByRodi,
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
          ...(body.note !== undefined ? { note: body.note === null ? null : String(body.note).slice(0, 300) } : {}),
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

    case "mapAddPlace": {
      if (!membership.isClub) return clubOnlyMap();
      const trip = await assertTripOwnership(body.tripId, shop, customerId);
      const place = cleanPlace(body);
      if (!place) return Response.json({ error: "BAD_PLACE" }, { status: 400 });
      if ((await mapPlaceCount(db, trip.id)) >= MAP_PLACE_LIMIT) {
        return Response.json({ error: "MAP_PLACE_LIMIT", limit: MAP_PLACE_LIMIT }, { status: 403 });
      }
      if (body.dayId) {
        const day = await db.day.findFirst({ where: { id: String(body.dayId), tripId: trip.id } });
        if (!day) return Response.json({ error: "Not found" }, { status: 404 });
        const count = await db.activity.count({ where: { dayId: day.id } });
        const activity = await db.activity.create({
          data: {
            dayId: day.id, title: place.name, category: place.category, note: place.note, lat: place.lat, lng: place.lng,
            location: typeof body.hood === "string" ? body.hood.slice(0, 160) || null : null, sortOrder: count,
          },
        });
        return Response.json({ kind: "activity", activity });
      }
      const created = await db.tripPlace.create({
        data: { tripId: trip.id, name: place.name, category: place.category, lat: place.lat, lng: place.lng, note: place.note, status: place.status },
      });
      return Response.json({ kind: "place", place: created });
    }

    case "mapMovePlace": {
      if (!membership.isClub) return clubOnlyMap();
      const isActivity = body.kind === "activity";
      const id = String(body.id ?? "");
      let tripId: string | null = null;
      if (isActivity) {
        const a = await db.activity.findUnique({ where: { id }, include: { day: { include: { trip: true } } } });
        if (a && a.day.trip.shop === shop && a.day.trip.customerId === customerId) tripId = a.day.tripId;
      } else {
        const pl = await db.tripPlace.findUnique({ where: { id }, include: { trip: true } });
        if (pl && pl.trip.shop === shop && pl.trip.customerId === customerId) tripId = pl.tripId;
      }
      if (!tripId) return Response.json({ error: "Not found" }, { status: 404 });
      const toDay = body.toDayId ? await db.day.findFirst({ where: { id: String(body.toDayId), tripId } }) : null;
      if (body.toDayId && !toDay) return Response.json({ error: "Not found" }, { status: 404 });
      const index = Number.isInteger(body.index) ? Number(body.index) : null;
      const result = await db.$transaction((tx) =>
        moveMapPlace(tx, { kind: isActivity ? "activity" : "place", id, tripId: tripId!, toDayId: toDay ? toDay.id : null, index }),
      );
      if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
      return Response.json(result);
    }

    case "mapUpdatePlace": {
      if (!membership.isClub) return clubOnlyMap();
      const id = String(body.id ?? "");
      const note = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, 300) || null : undefined;
      const category = typeof body.category === "string" && ["comida", "tienda", "must", "mirador", "cultura", "bar"].includes(body.category) ? body.category : undefined;
      if (body.kind === "activity") {
        const a = await db.activity.findUnique({ where: { id }, include: { day: { include: { trip: true } } } });
        if (!a || a.day.trip.shop !== shop || a.day.trip.customerId !== customerId) return Response.json({ error: "Not found" }, { status: 404 });
        const updated = await db.activity.update({ where: { id }, data: { ...(note !== undefined ? { note } : {}), ...(category ? { category } : {}) } });
        return Response.json({ activity: updated });
      }
      const pl = await db.tripPlace.findUnique({ where: { id }, include: { trip: true } });
      if (!pl || pl.trip.shop !== shop || pl.trip.customerId !== customerId) return Response.json({ error: "Not found" }, { status: 404 });
      const status = body.status === null ? null : (MAP_STATUSES as readonly string[]).includes(body.status) ? (body.status as string) : undefined;
      const updated = await db.tripPlace.update({
        where: { id },
        data: { ...(note !== undefined ? { note } : {}), ...(category ? { category } : {}), ...(status !== undefined ? { status } : {}) },
      });
      return Response.json({ place: updated });
    }

    // The map locates the activities of the itinerary that have no coordinates yet (the places RODI suggested) and saves what it found.
    case "mapSetCoords": {
      if (!membership.isClub) return clubOnlyMap();
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 60);
      let saved = 0;
      for (const it of items) {
        const lat = Number(it && it.lat), lng = Number(it && it.lng), id = String((it && it.id) ?? "");
        if (!id || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
        const act = await db.activity.findUnique({ where: { id }, include: { day: { include: { trip: true } } } });
        if (!act || act.day.trip.shop !== shop || act.day.trip.customerId !== customerId) continue;
        await db.activity.update({ where: { id }, data: { lat, lng } });
        saved++;
      }
      return Response.json({ ok: true, saved });
    }

    case "mapDeletePlace": {
      if (!membership.isClub) return clubOnlyMap();
      const id = String(body.id ?? "");
      if (body.kind === "activity") {
        const a = await db.activity.findUnique({ where: { id }, include: { day: { include: { trip: true } } } });
        if (!a || a.day.trip.shop !== shop || a.day.trip.customerId !== customerId) return Response.json({ error: "Not found" }, { status: 404 });
        await db.$transaction(async (tx) => { await tx.activity.delete({ where: { id } }); await reindexDay(tx, a.dayId); });
        return Response.json({ ok: true });
      }
      const pl = await db.tripPlace.findUnique({ where: { id }, include: { trip: true } });
      if (!pl || pl.trip.shop !== shop || pl.trip.customerId !== customerId) return Response.json({ error: "Not found" }, { status: 404 });
      await db.tripPlace.delete({ where: { id } });
      return Response.json({ ok: true });
    }

    case "mapImport": {
      if (!membership.isClub) return clubOnlyMap();
      const trip = await assertTripOwnership(body.tripId, shop, customerId);
      const incoming = (Array.isArray(body.places) ? body.places : []).slice(0, MAP_IMPORT_BATCH).map(cleanPlace).filter((p): p is NonNullable<typeof p> => p !== null);
      const [acts, places] = await Promise.all([
        db.activity.findMany({ where: { day: { tripId: trip.id }, lat: { not: null } }, select: { title: true, lat: true, lng: true } }),
        db.tripPlace.findMany({ where: { tripId: trip.id }, select: { name: true, lat: true, lng: true } }),
      ]);
      const pool = [
        ...acts.map((a) => ({ name: a.title, lat: a.lat as number, lng: a.lng as number })),
        ...places.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng })),
      ];
      const fresh: typeof incoming = [];
      let skipped = 0;
      for (const p of incoming) {
        if (isDuplicate(p, pool.concat(fresh))) skipped++;
        else fresh.push(p);
      }
      const { fit, over } = roomLeft(pool.length, fresh.length);
      const toAdd = fresh.slice(0, fit);
      await db.$transaction(
        toAdd.map((p) => db.tripPlace.create({ data: { tripId: trip.id, name: p.name, category: p.category, lat: p.lat, lng: p.lng, note: p.note, status: p.status } })),
      );
      const saved = await db.tripPlace.findMany({ where: { tripId: trip.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, category: true, lat: true, lng: true, note: true, status: true } });
      return Response.json({ added: toAdd.length, skipped, over, places: saved, limit: MAP_PLACE_LIMIT });
    }

    case "mapGeocode": {
      if (!membership.isClub) return clubOnlyMap();
      const names = (Array.isArray(body.names) ? body.names : []).filter((n: unknown): n is string => typeof n === "string").slice(0, 6);
      const allowed = names.filter(() => allowSearch(customerId));
      const lat = Number(body.lat), lon = Number(body.lon);
      const found = await geocodeNames(allowed, {
        lat: body.lat !== undefined && Number.isFinite(lat) ? lat : undefined,
        lon: body.lon !== undefined && Number.isFinite(lon) ? lon : undefined,
        lang: typeof body.lang === "string" ? body.lang : undefined,
      });
      return Response.json({ results: found, limited: names.length - allowed.length });
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

    // Smart packing (Club). The list is derived in the theme from the trip and these preferences; here we only keep the
    // member's choices and the state of the items they touched. Everything about it is Club-only, enforced here.
    case "setPackPrefs": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "smart_packing" }, { status: 403 });
      }
      const trip = await assertTripOwnership(body.tripId, shop, customerId);
      const prefs = sanitizePackPrefs(body.prefs);
      if (!prefs) return Response.json({ error: "Invalid preferences" }, { status: 400 });
      await db.trip.update({ where: { id: trip.id }, data: { packPrefs: JSON.stringify(prefs) } });
      // Rows left by the first Smart Packing (generated labels, no key) are replaced by the derived list.
      await db.checklistItem.deleteMany({ where: { tripId: trip.id, source: "smart", key: null } });
      return Response.json({ prefs });
    }

    case "setPackItem": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "smart_packing" }, { status: 403 });
      }
      const trip = await assertTripOwnership(body.tripId, shop, customerId);
      const key = String(body.key ?? "");
      if (!PACK_KEY.test(key)) return Response.json({ error: "Invalid item" }, { status: 400 });
      const data: { done?: boolean; qty?: number | null } = {};
      if (body.done !== undefined) data.done = Boolean(body.done);
      if (body.qty !== undefined) {
        if (body.qty === null) data.qty = null;
        else {
          const q = Math.round(Number(body.qty));
          if (!Number.isFinite(q) || q < 1 || q > 99) return Response.json({ error: "Invalid quantity" }, { status: 400 });
          data.qty = q;
        }
      }
      const existing = await db.checklistItem.findFirst({ where: { tripId: trip.id, key } });
      const item = existing
        ? await db.checklistItem.update({ where: { id: existing.id }, data })
        : await db.checklistItem.create({
            data: { tripId: trip.id, label: key, key, source: "smart", sortOrder: 2000, done: data.done ?? false, qty: data.qty ?? null },
          });
      return Response.json({ item });
    }

    // Nationality picker (My Passport). Replaces the customer's whole list. The stored text is the
    // canonical English name, which Embassy.nationality and Entry Requirement.traveler_nationality
    // match on. Free keeps one; Club can keep several.
    case "setNationalities": {
      const raw = body.nationalities;
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) {
        return Response.json({ error: "Invalid nationalities" }, { status: 400 });
      }
      const names = [...new Set(raw.map((v: string) => v.trim()).filter(Boolean))];
      if (names.some((n) => !NATIONALITY_NAMES.has(n))) {
        return Response.json({ error: "Unknown nationality" }, { status: 400 });
      }
      const limit = membership.isClub ? CLUB_NATIONALITY_LIMIT : FREE_NATIONALITY_LIMIT;
      if (names.length > limit) {
        return membership.isClub
          ? Response.json({ error: "NATIONALITY_LIMIT", limit }, { status: 400 })
          : Response.json({ error: "CLUB_ONLY", feature: "multiple_nationalities", limit }, { status: 403 });
      }
      if (!admin) {
        return Response.json({ error: "Could not save nationality" }, { status: 500 });
      }
      try {
        await saveNationalities(admin, customerId, names);
      } catch (err) {
        console.error("setNationalities failed", err);
        return Response.json({ error: "Could not save nationality" }, { status: 500 });
      }
      return Response.json({ nationalities: names, limit });
    }

    // Save / unsave a destination (country page and Destinations cards). Open to every signed-in member.
    case "setCountrySaved": {
      if (!admin) return Response.json({ error: "Could not save destination" }, { status: 500 });
      try {
        const result = await setCountrySaved(admin, shop, customerId, body.handle, body.id, body.saved === true);
        return Response.json(result);
      } catch (err) {
        if (err instanceof SavedCountriesFailure && err.code === "INVALID_COUNTRY") {
          return Response.json({ error: "Unknown destination" }, { status: 400 });
        }
        if (err instanceof SavedCountriesFailure && err.code === "LIMIT") {
          return Response.json({ error: "SAVED_LIMIT" }, { status: 400 });
        }
        console.error("setCountrySaved failed", err);
        return Response.json({ error: "Could not save destination" }, { status: 500 });
      }
    }

    // Mark a country in the passport (visited / want to go / planned), or remove it with status null. Open to every
    // signed-in member; the theme can't write customer data itself.
    case "setTravelEntry": {
      if (!admin) return Response.json({ error: "Could not save country" }, { status: 500 });
      try {
        const log = await setTravelEntry(admin, customerId, {
          country: body.country,
          status: body.status === null ? null : body.status,
          date_visited: body.date_visited,
          note: body.note,
        });
        // keep the public ranking in step with the passport; never let it fail the save
        try { await syncTravelStats(shop, customerId, log); } catch (err) { console.error("syncTravelStats failed", err); }
        return Response.json({ log });
      } catch (err) {
        if (err instanceof TravelLogFailure && (err.code === "INVALID_COUNTRY" || err.code === "INVALID_STATUS")) {
          return Response.json({ error: err.code }, { status: 400 });
        }
        if (err instanceof TravelLogFailure && err.code === "LIMIT") return Response.json({ error: "TRAVEL_LOG_LIMIT" }, { status: 400 });
        console.error("setTravelEntry failed", err);
        return Response.json({ error: "Could not save country" }, { status: 500 });
      }
    }

    // Where the member lives (profile step of the Club gate): country (ISO code) and city, kept in two customer metafields.
    case "setResidence": {
      if (!admin) return Response.json({ error: "ACCOUNT_UNAVAILABLE" }, { status: 503 });
      const residence = sanitizeResidence(body);
      if (!residence) return Response.json({ error: "INVALID", field: "residence" }, { status: 400 });
      try {
        await saveResidence(admin, customerId, residence);
        return Response.json({ residence });
      } catch (err) {
        console.error("setResidence failed", err);
        return Response.json({ error: "ACCOUNT_UNAVAILABLE" }, { status: 502 });
      }
    }

    // "Mi cuenta": the member edits their own Shopify customer record. Every op answers with the fresh account.
    case "updateAccount":
    case "saveAddress":
    case "deleteAddress":
    case "setDefaultAddress":
    case "setEmailMarketing": {
      if (!admin) return Response.json({ error: "ACCOUNT_UNAVAILABLE" }, { status: 503 });
      try {
        if (op === "updateAccount") await updateProfile(admin, customerId, sanitizeProfile(body));
        else if (op === "saveAddress") {
          await saveAddress(admin, customerId, sanitizeAddress(body.address), body.addressId ? sanitizeAddressId(body.addressId) : undefined, body.makeDefault === true);
        } else if (op === "deleteAddress") await deleteAddress(admin, customerId, sanitizeAddressId(body.addressId));
        else if (op === "setDefaultAddress") await setDefaultAddress(admin, customerId, sanitizeAddressId(body.addressId));
        else await setEmailMarketing(admin, customerId, body.subscribed === true);
        return Response.json({ account: await readAccount(admin, customerId) });
      } catch (err) {
        if (err instanceof AccountFailure && err.code === "INVALID") return Response.json({ error: "INVALID", field: err.detail ?? null }, { status: 400 });
        if (err instanceof AccountFailure && err.code === "LIMIT") return Response.json({ error: "ADDRESS_LIMIT" }, { status: 400 });
        console.error(`${op} failed`, err);
        return Response.json({ error: err instanceof AccountFailure && err.detail ? "SHOPIFY_REJECTED" : "ACCOUNT_UNAVAILABLE", detail: err instanceof AccountFailure ? err.detail ?? null : null }, { status: err instanceof AccountFailure && err.detail ? 422 : 502 });
      }
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
      const tripPeople = (await db.participant.findMany({ where: { tripId: body.tripId }, select: { id: true } })).map((p) => p.id);
      const expense = await db.expense.create({
        data: {
          tripId: body.tripId,
          kind,
          category: body.category ?? "otros",
          label: String(body.label ?? ""),
          amount,
          date: body.date ? new Date(body.date) : null,
          paidById: body.paidById ?? null,
          splitWith: cleanSplitWith(body.splitWith, tripPeople),
        },
      });
      return Response.json({ expense });
    }

    case "updateExpense": {
      const expense = await db.expense.findUnique({ where: { id: body.expenseId }, include: { trip: true } });
      if (!expense || expense.trip.shop !== shop || expense.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      const tripPeopleU = body.splitWith !== undefined ? (await db.participant.findMany({ where: { tripId: expense.tripId }, select: { id: true } })).map((p) => p.id) : [];
      const updated = await db.expense.update({
        where: { id: body.expenseId },
        data: {
          ...(body.splitWith !== undefined ? { splitWith: cleanSplitWith(body.splitWith, tripPeopleU) } : {}),
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
        data: {
          tripId: body.tripId,
          name,
          sortOrder: count,
          weight: Number.isFinite(Number(body.weight)) ? Math.max(0.05, Math.min(1, Number(body.weight))) : 1,
          email: cleanEmail(body.email),
          phone: cleanPhone(body.phone),
        },
      });
      return Response.json({ participant });
    }

    case "updateParticipant": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "split" }, { status: 403 });
      }
      const person = await db.participant.findUnique({ where: { id: body.participantId }, include: { trip: true } });
      if (!person || person.trip.shop !== shop || person.trip.customerId !== customerId) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      const newName = body.name !== undefined ? String(body.name).trim().slice(0, 60) : undefined;
      if (newName !== undefined && !newName) return Response.json({ error: "Name is required" }, { status: 400 });
      const updatedPerson = await db.participant.update({
        where: { id: body.participantId },
        data: {
          ...(newName !== undefined ? { name: newName } : {}),
          ...(body.email !== undefined ? { email: cleanEmail(body.email) } : {}),
          ...(body.phone !== undefined ? { phone: cleanPhone(body.phone) } : {}),
        },
      });
      return Response.json({ participant: updatedPerson });
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

    case "saveCalcPlan": {
      const parsed = sanitizePlan(body.data);
      if (!parsed.ok) {
        return Response.json({ error: parsed.error }, { status: parsed.error === "PLAN_TOO_LARGE" ? 413 : 400 });
      }
      const plan = parsed.plan;
      const limit = membership.isClub ? CALC_CLUB_PLAN_LIMIT : CALC_FREE_PLAN_LIMIT;
      const totals = computeTotals(plan);
      const name = String(body.name ?? "").replace(/[^\p{L}\p{N} .,'()/#&-]/gu, "").trim().slice(0, 40) || "Plan";
      const data = JSON.stringify(plan);

      let existing = null;
      if (body.planId) {
        existing = await db.calculatorPlan.findFirst({ where: { id: String(body.planId), shop, customerId } });
        if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
      } else {
        const count = await db.calculatorPlan.count({ where: { shop, customerId } });
        if (count >= limit) {
          return Response.json({ error: "FREE_CALC_PLAN_LIMIT", limit }, { status: 403 });
        }
      }
      const fields = { name, currency: plan.f.mc, total: Math.round(totals.total), data };
      const saved = existing
        ? await db.calculatorPlan.update({ where: { id: existing.id }, data: fields })
        : await db.calculatorPlan.create({ data: { shop, customerId, ...fields } });
      return Response.json({
        plan: { id: saved.id, name: saved.name, currency: saved.currency, total: saved.total, tripId: saved.tripId, updatedAt: saved.updatedAt },
        totals,
      });
    }

    case "deleteCalcPlan": {
      const plan = await db.calculatorPlan.findFirst({ where: { id: String(body.planId ?? ""), shop, customerId } });
      if (!plan) return Response.json({ error: "Not found" }, { status: 404 });
      await db.calculatorPlan.delete({ where: { id: plan.id } });
      return Response.json({ ok: true });
    }

    // Pushes a saved plan into Budget: the trip's budget becomes the goal
    // the member typed (or the plan total when there is none) and one
    // expense per panel is written. Re-applying replaces only the rows this
    // plan wrote before (Expense.planId), never anything typed by hand.
    case "applyCalcPlan": {
      const plan = await db.calculatorPlan.findFirst({ where: { id: String(body.planId ?? ""), shop, customerId } });
      if (!plan) return Response.json({ error: "Not found" }, { status: 404 });
      const parsed = sanitizePlan(JSON.parse(plan.data));
      if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
      const data = parsed.plan;
      const totals = computeTotals(data);
      const loc = ["es", "en", "fr", "it"].includes(body.locale) ? body.locale : "en";
      const labels = PANEL_LABELS[loc];

      type Row = { category: string; label: string; amount: number };
      const rows: Row[] = [];
      for (const p of data.panels) {
        const amount = Math.round(totals.panelTotals[p.id] ?? 0);
        if (!p.on || amount <= 0) continue;
        rows.push({ category: budgetCategory(p.id), label: p.custom ? (p.name ?? "") : labels[p.id], amount });
      }
      if (totals.contingency > 0) rows.push({ category: "otros", label: labels.cont, amount: Math.round(totals.contingency) });

      let trip;
      if (body.tripId) {
        trip = await assertTripOwnership(String(body.tripId), shop, customerId);
      } else {
        if (!membership.isClub) {
          const tripCount = await db.trip.count({ where: { shop, customerId } });
          if (tripCount >= FREE_TRIP_LIMIT) {
            return Response.json({ error: "FREE_TRIP_LIMIT", limit: FREE_TRIP_LIMIT }, { status: 403 });
          }
        }
        const start = data.f.ms ? new Date(data.f.ms + "T00:00:00Z") : null;
        trip = await db.trip.create({
          data: {
            shop, customerId, title: plan.name || "Trip",
            destination: [...new Set(data.stops.map((s) => s.c))].slice(0, 3).join(" · ") || null,
            startDate: start,
            endDate: start ? new Date(start.getTime() + totals.days * 86_400_000) : null,
          },
        });
      }

      if (!membership.isClub) {
        const others = await db.expense.count({
          where: { tripId: trip.id, kind: "budget", OR: [{ planId: null }, { planId: { not: plan.id } }] },
        });
        if (others + rows.length > FREE_BUDGET_EXPENSE_LIMIT) {
          return Response.json({ error: "FREE_BUDGET_LIMIT", limit: FREE_BUDGET_EXPENSE_LIMIT }, { status: 403 });
        }
      }

      await db.$transaction([
        db.expense.deleteMany({ where: { tripId: trip.id, planId: plan.id } }),
        db.expense.createMany({
          data: rows.map((r) => ({ tripId: trip.id, kind: "budget", planId: plan.id, ...r })),
        }),
        db.trip.update({
          where: { id: trip.id },
          data: { budgetTotal: data.f.goal > 0 ? data.f.goal : Math.round(totals.total), budgetCurrency: data.f.mc },
        }),
        db.calculatorPlan.update({ where: { id: plan.id }, data: { tripId: trip.id } }),
      ]);
      return Response.json({ tripId: trip.id, expenses: rows.length });
    }

    // Club-only: copies the plan's travelers into the trip's Split
    // participants (matched by name, so running it twice doesn't duplicate
    // anyone) with the share each one carries (a child paying 60% counts 0.6).
    case "syncCalcSplit": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "split" }, { status: 403 });
      }
      const plan = await db.calculatorPlan.findFirst({ where: { id: String(body.planId ?? ""), shop, customerId } });
      if (!plan) return Response.json({ error: "Not found" }, { status: 404 });
      const trip = await assertTripOwnership(String(body.tripId ?? plan.tripId ?? ""), shop, customerId);
      const parsed = sanitizePlan(JSON.parse(plan.data));
      if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

      const current = await db.participant.findMany({ where: { tripId: trip.id } });
      let order = current.length;
      const fallback = String(body.fallbackName ?? "").replace(/[^\p{L} ]/gu, "").slice(0, 20) || "Traveler";
      let touched = 0;
      for (const [i, t] of parsed.plan.trav.entries()) {
        const name = t.n || `${fallback} ${i + 1}`;
        const weight = Math.max(0.05, Math.min(1, t.w / 100));
        const match = current.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (match) {
          await db.participant.update({ where: { id: match.id }, data: { weight } });
        } else {
          await db.participant.create({ data: { tripId: trip.id, name, weight, sortOrder: order++ } });
        }
        touched++;
      }
      await db.calculatorPlan.update({ where: { id: plan.id }, data: { tripId: trip.id } });
      return Response.json({ tripId: trip.id, participants: touched });
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
      const name = String(body.name ?? "").trim().slice(0, 60);
      if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
      // a companion belongs to one of the member's own trips
      const tripId = typeof body.tripId === "string" && body.tripId ? body.tripId : null;
      if (tripId) await assertTripOwnership(tripId, shop, customerId);
      const count = await db.emergencyContact.count({ where: { shop, customerId } });
      const contact = await db.emergencyContact.create({
        data: {
          shop,
          customerId,
          name,
          phone: body.phone ? String(body.phone).trim().slice(0, 30) : null,
          note: body.note ? String(body.note).trim().slice(0, 120) : null,
          kind: tripId && body.kind === "companion" ? "companion" : "contact",
          tripId: tripId && body.kind === "companion" ? tripId : null,
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

    case "saveJournalPage": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "journal" }, { status: 403 });
      }
      try {
        const page = await savePage(shop, customerId, body.country, { quote: body.quote, items: body.items });
        try { await pruneUnusedPhotos(shop, customerId); } catch (err) { console.error("pruneUnusedPhotos failed", err); }
        return Response.json({ country: body.country, ...page });
      } catch (err) {
        if (err instanceof JournalFailure) return Response.json({ error: err.code }, { status: err.status });
        console.error("saveJournalPage failed", err);
        return Response.json({ error: "Could not save page" }, { status: 500 });
      }
    }

    // A member tells RODI that a suggested place has closed. Open to any signed-in member (Free or Club).
    case "reportPlace": {
      const res = await saveReport(shop, customerId, { name: body.name, city: body.city, country: body.country });
      if ("error" in res) return Response.json({ error: res.error }, { status: res.error === "RATE_LIMIT" ? 429 : 400 });
      return Response.json({ ok: true });
    }

    // The friend arrives with a code (theme: assets/rodi-referral.js) and claims it once signed in. Definitive refusals are
    // 4xx JSON so the theme can stop retrying; the reward itself is paid later, when the friend creates a first trip.
    case "claimReferral": {
      const res = await claimReferral(shop, customerId, body.code);
      if ("error" in res) return Response.json({ error: res.error }, { status: 400 });
      return Response.json(res);
    }

    case "saveJournalCover": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "journal" }, { status: 403 });
      }
      try {
        return Response.json(await saveCover(shop, customerId, body.continent, { title: body.title, color: body.color }));
      } catch (err) {
        if (err instanceof JournalFailure) return Response.json({ error: err.code }, { status: err.status });
        console.error("saveJournalCover failed", err);
        return Response.json({ error: "Could not save cover" }, { status: 500 });
      }
    }

    case "addJournalPhoto": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "journal" }, { status: 403 });
      }
      try {
        const photo = await addPhoto(shop, customerId, body.dataUrl);
        return Response.json({ id: photo.id, count: photo.count });
      } catch (err) {
        if (err instanceof JournalFailure) return Response.json({ error: err.code }, { status: err.status });
        console.error("addJournalPhoto failed", err);
        return Response.json({ error: "Could not save photo" }, { status: 500 });
      }
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
      { const verdict = await moderate([title, bodyText, body.city, authorName]); if (!verdict.ok) return Response.json({ error: "CONTENT_BLOCKED", category: verdict.category }, { status: 422 }); }
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
      { const verdict = await moderate([bodyText, authorName]); if (!verdict.ok) return Response.json({ error: "CONTENT_BLOCKED", category: verdict.category }, { status: 422 }); }
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
      { const verdict = await moderate([title, bodyText, body.city, authorName]); if (!verdict.ok) return Response.json({ error: "CONTENT_BLOCKED", category: verdict.category }, { status: 422 }); }
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

    // Live check while a member types (word lists only, no AI call per keystroke); publishing runs the full check.
    case "communityCheck": {
      const verdict = checkWords(body.title, body.body, body.city, body.tags);
      return Response.json(verdict.ok ? { ok: true } : { ok: false, category: verdict.category });
    }

    case "communityPostCreate":
    case "communityReplyCreate":
    case "communityLike":
    case "communityAccept":
    case "communityReport":
    case "communityRemove": {
      if (!membership.isClub) {
        return Response.json({ error: "CLUB_ONLY", feature: "community" }, { status: 403 });
      }
      try {
        if (op === "communityPostCreate") {
          const post = await createCommunityPost(shop, customerId, body.authorName, body);
          return Response.json({ post: { id: post.id } });
        }
        if (op === "communityReplyCreate") {
          const reply = await createCommunityReply(shop, customerId, body.authorName, String(body.postId ?? ""), body.body);
          return Response.json({ reply: { id: reply.id } });
        }
        if (op === "communityLike") return Response.json(await toggleCommunityLike(shop, customerId, String(body.targetType), String(body.targetId)));
        if (op === "communityAccept") return Response.json(await acceptCommunityReply(shop, customerId, String(body.postId), String(body.replyId)));
        if (op === "communityReport") return Response.json(await reportCommunity(shop, customerId, String(body.targetType), String(body.targetId)));
        return Response.json(await removeOwnCommunity(shop, customerId, String(body.targetType), String(body.targetId)));
      } catch (err) {
        if (err instanceof CommunityFailure) return Response.json({ error: err.code, category: err.category }, { status: err.status });
        console.error(`${op} failed`, err);
        return Response.json({ error: "COMMUNITY_UNAVAILABLE" }, { status: 502 });
      }
    }

    case "createServiceInquiry": {
      // No membership.isClub check — RODI Services is open to any
      // signed-in customer, Free or Club, same as the original spec's
      // "one-time paid add-on" framing (not a membership perk).
      // RODI Services are switched off until the owner says so: set SERVICES_ENABLED=true (and services_on in the theme) to open them.
      if (process.env.SERVICES_ENABLED !== "true") return Response.json({ error: "SERVICES_OFF" }, { status: 403 });
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
