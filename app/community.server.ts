// Community forum (Club): questions and recommendations in one stream, up to 10 replies per post, likes, ranks.
// Pure helpers are exported on their own so they can be tested without a database.
import db from "./db.server";
import { moderate } from "./moderation.server";

export const TOPICS = [
  "general", "equipaje", "cultura", "tradiciones", "leyes", "planes", "guias", "tours", "comida", "transporte",
  "alojamiento", "seguridad", "salud", "dinero", "documentos", "clima", "familia", "aventura", "compras",
] as const;
export const POST_TYPES = ["question", "recommendation"] as const;
export const MAX_REPLIES = 10;
export const MAX_TAGS = 5;
export const PAGE_SIZE = 20;
const POSTS_PER_DAY = 8;
const REPLIES_PER_DAY = 40;
const REPORTS_TO_HIDE = 3;

export class CommunityFailure extends Error {
  constructor(public code: string, public status = 400, public category?: string) {
    super(code);
  }
}

/** Rank levels by points: a post is worth 5, a reply 2, every like received 1. */
export const LEVELS = [
  { key: "traveler", min: 0 },
  { key: "explorer", min: 20 },
  { key: "guide", min: 60 },
  { key: "ambassador", min: 150 },
  { key: "legend", min: 400 },
] as const;

export function pointsFor(posts: number, replies: number, likes: number): number {
  return posts * 5 + replies * 2 + likes;
}
export function levelFor(points: number): { key: string; points: number; next: number | null } {
  let current: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) if (points >= l.min) current = l;
  const idx = LEVELS.indexOf(current);
  return { key: current.key, points, next: idx < LEVELS.length - 1 ? LEVELS[idx + 1].min : null };
}

/** "#Playa, #Visa-Colombia  mochila" -> ["playa", "visacolombia", "mochila"] (letters and digits only, 2-24 chars, 5 at most). */
export function normalizeTags(input: unknown): string[] {
  const list = Array.isArray(input) ? input : String(input ?? "").split(/[\s,;]+/);
  const out: string[] = [];
  for (const raw of list) {
    const t = String(raw).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "").slice(0, 24);
    if (t.length >= 2 && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export function cleanText(v: unknown, max: number): string {
  return String(v ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}
export function cleanAuthor(v: unknown): string {
  return cleanText(v, 40).replace(/\n/g, " ") || "RODI";
}
export function cleanCountry(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{2,60}$/.test(s) ? s : null;
}
export function cleanTopic(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  return (TOPICS as readonly string[]).includes(s) ? s : "general";
}
export function cleanRating(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/** The text box accepts "#playa lisboa" style queries: words and #tags are split here. */
export function parseQuery(q: unknown): { words: string[]; tags: string[] } {
  const words: string[] = [], tags: string[] = [];
  for (const part of String(q ?? "").trim().slice(0, 120).split(/\s+/)) {
    if (!part) continue;
    if (part.startsWith("#")) { const t = normalizeTags(part)[0]; if (t) tags.push(t); } else words.push(part);
  }
  return { words: words.slice(0, 6), tags: tags.slice(0, 3) };
}

function parseTags(json: string | null): string[] {
  try { const a = json ? JSON.parse(json) : []; return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}

type AuthorStat = { points: number; level: string; next: number | null; posts: number; replies: number };

/** Posts, replies and likes received per author, turned into points and a level. */
export async function authorStats(shop: string, customerIds: string[]): Promise<Map<string, AuthorStat>> {
  const ids = Array.from(new Set(customerIds));
  const out = new Map<string, AuthorStat>();
  if (!ids.length) return out;
  const [posts, replies] = await Promise.all([
    db.communityPost.groupBy({ by: ["customerId"], where: { shop, status: "published", customerId: { in: ids } }, _count: { _all: true }, _sum: { likeCount: true } }),
    db.communityReply.groupBy({ by: ["customerId"], where: { shop, status: "published", customerId: { in: ids } }, _count: { _all: true }, _sum: { likeCount: true } }),
  ]);
  for (const id of ids) {
    const p = posts.find((x) => x.customerId === id), r = replies.find((x) => x.customerId === id);
    const np = p?._count._all ?? 0, nr = r?._count._all ?? 0, likes = (p?._sum.likeCount ?? 0) + (r?._sum.likeCount ?? 0);
    const lv = levelFor(pointsFor(np, nr, likes));
    out.set(id, { points: lv.points, level: lv.key, next: lv.next, posts: np, replies: nr });
  }
  return out;
}

type Viewer = string | null;

/** Customer ids the viewer has blocked (their posts and replies are hidden from the viewer). */
export async function blockedIds(shop: string, viewer: Viewer): Promise<string[]> {
  if (!viewer) return [];
  return (await db.communityBlock.findMany({ where: { shop, blockerId: viewer }, select: { blockedId: true } })).map((b) => b.blockedId);
}

/** Blocks the author of a post or reply (never yourself). The blocked member is not notified. */
export async function blockAuthor(shop: string, blockerId: string, targetType: string, targetId: string) {
  if (targetType !== "post" && targetType !== "reply") throw new CommunityFailure("BAD_TARGET");
  const target: any = targetType === "post"
    ? await db.communityPost.findFirst({ where: { id: targetId, shop }, select: { customerId: true, authorName: true } })
    : await db.communityReply.findFirst({ where: { id: targetId, shop }, select: { customerId: true, authorName: true } });
  if (!target) throw new CommunityFailure("NOT_FOUND", 404);
  if (target.customerId === blockerId) throw new CommunityFailure("SELF_BLOCK", 400);
  const name = cleanAuthor(target.authorName);
  await db.communityBlock.upsert({
    where: { shop_blockerId_blockedId: { shop, blockerId, blockedId: target.customerId } },
    create: { shop, blockerId, blockedId: target.customerId, blockedName: name },
    update: { blockedName: name },
  });
  return { blocked: true, name };
}

/** Lifts a block by the id of the block row (the other member's customer id is never exposed). */
export async function unblock(shop: string, blockerId: string, blockId: string) {
  const r = await db.communityBlock.deleteMany({ where: { id: blockId, shop, blockerId } });
  if (!r.count) throw new CommunityFailure("NOT_FOUND", 404);
  return { unblocked: true };
}

/** The members the viewer has blocked, for the "blocked members" list (names only). */
export async function listBlocked(shop: string, viewer: Viewer) {
  if (!viewer) return { blocked: [] as { id: string; name: string }[] };
  const rows = await db.communityBlock.findMany({ where: { shop, blockerId: viewer }, orderBy: { createdAt: "desc" }, take: 200 });
  return { blocked: rows.map((b) => ({ id: b.id, name: b.blockedName || "RODI" })) };
}

function shapePost(p: any, stats: Map<string, AuthorStat>, liked: Set<string>, viewer: Viewer) {
  const st = stats.get(p.customerId);
  return {
    id: p.id, type: p.type, title: p.title, body: p.body, country: p.country, city: p.city, topic: p.topic, tags: parseTags(p.tags), rating: p.rating,
    likeCount: p.likeCount, replyCount: p.replyCount, acceptedReplyId: p.acceptedReplyId, createdAt: p.createdAt, lastActivityAt: p.lastActivityAt,
    authorName: p.authorName, author: st ? { level: st.level, points: st.points } : { level: "traveler", points: 0 },
    liked: liked.has(p.id), mine: !!viewer && p.customerId === viewer,
  };
}
function shapeReply(r: any, stats: Map<string, AuthorStat>, liked: Set<string>, viewer: Viewer) {
  const st = stats.get(r.customerId);
  return { id: r.id, body: r.body, createdAt: r.createdAt, likeCount: r.likeCount, authorName: r.authorName, author: st ? { level: st.level, points: st.points } : { level: "traveler", points: 0 }, liked: liked.has(r.id), mine: !!viewer && r.customerId === viewer };
}

export type FeedQuery = { type?: string; country?: string; topic?: string; tag?: string; q?: string; sort?: string; page?: number; mine?: boolean };

export async function feed(shop: string, viewer: Viewer, query: FeedQuery) {
  const where: any = { shop, status: "published" };
  if (query.type && (POST_TYPES as readonly string[]).includes(query.type)) where.type = query.type;
  const country = cleanCountry(query.country);
  if (country) where.country = country;
  if (query.topic && (TOPICS as readonly string[]).includes(query.topic)) where.topic = query.topic;
  if (query.mine && viewer) where.customerId = viewer;
  else {
    const hidden = await blockedIds(shop, viewer);
    if (hidden.length) where.customerId = { notIn: hidden };
  }
  const and: any[] = [];
  const { words, tags } = parseQuery(query.q);
  for (const t of [...tags, ...normalizeTags(query.tag)]) and.push({ tags: { contains: `"${t}"` } });
  for (const w of words) and.push({ OR: [{ title: { contains: w } }, { body: { contains: w } }, { city: { contains: w } }, { country: { contains: w.toLowerCase() } }, { tags: { contains: w.toLowerCase() } }] });
  if (and.length) where.AND = and;
  let orderBy: any = { createdAt: "desc" };
  if (query.sort === "top") orderBy = [{ likeCount: "desc" }, { replyCount: "desc" }, { createdAt: "desc" }];
  else if (query.sort === "active") orderBy = { lastActivityAt: "desc" };
  else if (query.sort === "unanswered") { where.type = "question"; where.replyCount = 0; }
  const page = Math.max(1, Math.min(200, Math.floor(Number(query.page) || 1)));
  const [total, rows] = await Promise.all([
    db.communityPost.count({ where }),
    db.communityPost.findMany({ where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  const stats = await authorStats(shop, rows.map((r) => r.customerId));
  const liked = new Set<string>();
  if (viewer && rows.length) {
    (await db.communityLike.findMany({ where: { customerId: viewer, targetType: "post", targetId: { in: rows.map((r) => r.id) } }, select: { targetId: true } })).forEach((l) => liked.add(l.targetId));
  }
  return { posts: rows.map((r) => shapePost(r, stats, liked, viewer)), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function thread(shop: string, viewer: Viewer, id: string) {
  const post = await db.communityPost.findFirst({ where: { id, shop, status: "published" } });
  if (!post) return null;
  const hidden = await blockedIds(shop, viewer);
  if (hidden.includes(post.customerId)) return null;
  const replies = await db.communityReply.findMany({
    where: { postId: id, shop, status: "published", ...(hidden.length ? { customerId: { notIn: hidden } } : {}) },
    orderBy: { createdAt: "asc" }, take: 30,
  });
  const stats = await authorStats(shop, [post.customerId, ...replies.map((r) => r.customerId)]);
  const likedPosts = new Set<string>(), likedReplies = new Set<string>();
  if (viewer) {
    (await db.communityLike.findMany({ where: { customerId: viewer, OR: [{ targetType: "post", targetId: id }, { targetType: "reply", targetId: { in: replies.map((r) => r.id) } }] }, select: { targetType: true, targetId: true } }))
      .forEach((l) => (l.targetType === "post" ? likedPosts : likedReplies).add(l.targetId));
  }
  return { post: shapePost(post, stats, likedPosts, viewer), replies: replies.map((r) => shapeReply(r, stats, likedReplies, viewer)), maxReplies: MAX_REPLIES };
}

/** What the filters need: topics and countries with counts, popular hashtags, top voices of the last 30 days. */
export async function meta(shop: string) {
  const published = { shop, status: "published" };
  const since = new Date(Date.now() - 30 * 86400000);
  const [topics, countries, recent, posts30, replies30, totalPosts, totalReplies] = await Promise.all([
    db.communityPost.groupBy({ by: ["topic"], where: published, _count: { _all: true } }),
    db.communityPost.groupBy({ by: ["country"], where: { ...published, country: { not: null } }, _count: { _all: true }, orderBy: { _count: { country: "desc" } }, take: 40 }),
    db.communityPost.findMany({ where: published, orderBy: { createdAt: "desc" }, take: 400, select: { tags: true } }),
    db.communityPost.groupBy({ by: ["customerId"], where: { ...published, createdAt: { gte: since } }, _count: { _all: true }, _sum: { likeCount: true } }),
    db.communityReply.groupBy({ by: ["customerId"], where: { ...published, createdAt: { gte: since } }, _count: { _all: true }, _sum: { likeCount: true } }),
    db.communityPost.count({ where: published }),
    db.communityReply.count({ where: published }),
  ]);
  const tagCount = new Map<string, number>();
  for (const r of recent) for (const t of parseTags(r.tags)) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  const tags = Array.from(tagCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count }));
  const month = new Map<string, number>();
  for (const p of posts30) month.set(p.customerId, (month.get(p.customerId) ?? 0) + pointsFor(p._count._all, 0, p._sum.likeCount ?? 0));
  for (const r of replies30) month.set(r.customerId, (month.get(r.customerId) ?? 0) + pointsFor(0, r._count._all, r._sum.likeCount ?? 0));
  const top = Array.from(month.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const stats = await authorStats(shop, top.map(([id]) => id));
  const names = new Map<string, string>();
  (await db.communityPost.findMany({ where: { shop, customerId: { in: top.map(([id]) => id) } }, orderBy: { createdAt: "desc" }, select: { customerId: true, authorName: true } })).forEach((p) => { if (!names.has(p.customerId)) names.set(p.customerId, p.authorName); });
  (await db.communityReply.findMany({ where: { shop, customerId: { in: top.map(([id]) => id) } }, orderBy: { createdAt: "desc" }, select: { customerId: true, authorName: true } })).forEach((p) => { if (!names.has(p.customerId)) names.set(p.customerId, p.authorName); });
  return {
    topics: topics.map((t) => ({ topic: t.topic, count: t._count._all })),
    countries: countries.map((c) => ({ country: c.country, count: c._count._all })),
    tags,
    leaders: top.map(([id, points]) => ({ name: names.get(id) ?? "RODI", monthPoints: points, level: stats.get(id)?.level ?? "traveler" })),
    totals: { posts: totalPosts, replies: totalReplies },
  };
}

async function dailyCount(model: "communityPost" | "communityReply", shop: string, customerId: string): Promise<number> {
  const since = new Date(Date.now() - 86400000);
  return (db as any)[model].count({ where: { shop, customerId, createdAt: { gte: since } } });
}

export async function createPost(shop: string, customerId: string, authorName: string, input: Record<string, unknown>) {
  const type = (POST_TYPES as readonly string[]).includes(String(input.type)) ? String(input.type) : null;
  const title = cleanText(input.title, 120), body = cleanText(input.body, 2000);
  if (!type) throw new CommunityFailure("BAD_TYPE");
  if (title.length < 6) throw new CommunityFailure("TITLE_SHORT");
  if (body.length < 10) throw new CommunityFailure("BODY_SHORT");
  // nothing that breaks the Community Guidelines gets published (word lists + optional AI review)
  const verdict = await moderate([title, body, input.city, Array.isArray(input.tags) ? input.tags.join(" ") : input.tags, authorName]);
  if (!verdict.ok) throw new CommunityFailure("CONTENT_BLOCKED", 422, verdict.category);
  if ((await dailyCount("communityPost", shop, customerId)) >= POSTS_PER_DAY) throw new CommunityFailure("RATE_LIMIT", 429);
  const dup = await db.communityPost.findFirst({ where: { shop, customerId, title, createdAt: { gte: new Date(Date.now() - 3600000) } } });
  if (dup) throw new CommunityFailure("DUPLICATE", 409);
  const tags = normalizeTags(input.tags);
  return db.communityPost.create({
    data: {
      shop, customerId, authorName: cleanAuthor(authorName), type, title, body,
      country: cleanCountry(input.country), city: cleanText(input.city, 60) || null, topic: cleanTopic(input.topic),
      tags: tags.length ? JSON.stringify(tags) : null, rating: type === "recommendation" ? cleanRating(input.rating) : null,
    },
  });
}

export async function createReply(shop: string, customerId: string, authorName: string, postId: string, bodyIn: unknown) {
  const body = cleanText(bodyIn, 1000);
  if (body.length < 2) throw new CommunityFailure("BODY_SHORT");
  const verdict = await moderate([body, authorName]);
  if (!verdict.ok) throw new CommunityFailure("CONTENT_BLOCKED", 422, verdict.category);
  const post = await db.communityPost.findFirst({ where: { id: postId, shop, status: "published" } });
  if (!post) throw new CommunityFailure("NOT_FOUND", 404);
  if (post.replyCount >= MAX_REPLIES) throw new CommunityFailure("REPLY_LIMIT", 409);
  if ((await dailyCount("communityReply", shop, customerId)) >= REPLIES_PER_DAY) throw new CommunityFailure("RATE_LIMIT", 429);
  const [reply] = await db.$transaction([
    db.communityReply.create({ data: { shop, customerId, authorName: cleanAuthor(authorName), postId, body } }),
    db.communityPost.update({ where: { id: postId }, data: { replyCount: { increment: 1 }, lastActivityAt: new Date() } }),
  ]);
  return reply;
}

/** Toggle a like. You cannot like your own post or reply. Returns the new state and count. */
export async function toggleLike(shop: string, customerId: string, targetType: string, targetId: string) {
  if (targetType !== "post" && targetType !== "reply") throw new CommunityFailure("BAD_TARGET");
  const target: any = targetType === "post"
    ? await db.communityPost.findFirst({ where: { id: targetId, shop, status: "published" } })
    : await db.communityReply.findFirst({ where: { id: targetId, shop, status: "published" } });
  if (!target) throw new CommunityFailure("NOT_FOUND", 404);
  if (target.customerId === customerId) throw new CommunityFailure("SELF_LIKE", 400);
  const existing = await db.communityLike.findUnique({ where: { customerId_targetType_targetId: { customerId, targetType, targetId } } });
  const model: any = targetType === "post" ? db.communityPost : db.communityReply;
  if (existing) {
    await db.$transaction([db.communityLike.delete({ where: { id: existing.id } }), model.update({ where: { id: targetId }, data: { likeCount: { decrement: 1 } } })]);
    return { liked: false, likeCount: Math.max(0, target.likeCount - 1) };
  }
  await db.$transaction([db.communityLike.create({ data: { shop, customerId, targetType, targetId } }), model.update({ where: { id: targetId }, data: { likeCount: { increment: 1 } } })]);
  return { liked: true, likeCount: target.likeCount + 1 };
}

/** The asker marks (or unmarks) the reply that helped. */
export async function acceptReply(shop: string, customerId: string, postId: string, replyId: string) {
  const post = await db.communityPost.findFirst({ where: { id: postId, shop, customerId, status: "published" } });
  if (!post) throw new CommunityFailure("NOT_FOUND", 404);
  const reply = await db.communityReply.findFirst({ where: { id: replyId, postId, shop, status: "published" } });
  if (!reply) throw new CommunityFailure("NOT_FOUND", 404);
  const next = post.acceptedReplyId === replyId ? null : replyId;
  await db.communityPost.update({ where: { id: postId }, data: { acceptedReplyId: next } });
  return { acceptedReplyId: next };
}

/** One report per member per item; three reports hide it until RODI reviews it. */
export async function report(shop: string, customerId: string, targetType: string, targetId: string) {
  if (targetType !== "post" && targetType !== "reply") throw new CommunityFailure("BAD_TARGET");
  const key = targetType === "post" ? "report-post" : "report-reply";
  const done = await db.communityLike.findUnique({ where: { customerId_targetType_targetId: { customerId, targetType: key, targetId } } });
  if (done) return { reported: true };
  const model: any = targetType === "post" ? db.communityPost : db.communityReply;
  const target = await model.findFirst({ where: { id: targetId, shop } });
  if (!target) throw new CommunityFailure("NOT_FOUND", 404);
  const count = target.reportCount + 1;
  await db.$transaction([
    db.communityLike.create({ data: { shop, customerId, targetType: key, targetId } }),
    model.update({ where: { id: targetId }, data: { reportCount: { increment: 1 }, ...(count >= REPORTS_TO_HIDE && target.status === "published" ? { status: "flagged" } : {}) } }),
  ]);
  return { reported: true };
}

/** Authors can remove their own posts and replies (kept in the database as "removed"). */
export async function removeOwn(shop: string, customerId: string, targetType: string, targetId: string) {
  if (targetType === "post") {
    const r = await db.communityPost.updateMany({ where: { id: targetId, shop, customerId }, data: { status: "removed" } });
    if (!r.count) throw new CommunityFailure("NOT_FOUND", 404);
    return { ok: true };
  }
  if (targetType === "reply") {
    const reply = await db.communityReply.findFirst({ where: { id: targetId, shop, customerId } });
    if (!reply) throw new CommunityFailure("NOT_FOUND", 404);
    await db.$transaction([
      db.communityReply.update({ where: { id: targetId }, data: { status: "removed" } }),
      db.communityPost.updateMany({ where: { id: reply.postId, replyCount: { gt: 0 } }, data: { replyCount: { decrement: 1 } } }),
    ]);
    return { ok: true };
  }
  throw new CommunityFailure("BAD_TARGET");
}
