import db from "./db.server";

// "Where is everyone going": a public ranking of countries for the Home. A member counts once per country, either because they
// saved it or because it is in their passport (visited, want to go or planned). Only counts leave here, never who did what.

type LogEntry = { country: string; status: string };

// Mirror one member's passport into CountryTravel: the table always equals their current log.
export async function syncTravelStats(shop: string, customerId: string, log: LogEntry[]) {
  const handles = log.map((e) => e.country);
  await db.countryTravel.deleteMany({ where: { shop, customerId, countryHandle: { notIn: handles } } });
  for (const e of log) {
    await db.countryTravel.upsert({
      where: { shop_customerId_countryHandle: { shop, customerId, countryHandle: e.country } },
      create: { shop, customerId, countryHandle: e.country, status: e.status },
      update: { status: e.status },
    });
  }
}

export async function popularCountries(shop: string, take = 6) {
  const [saves, travels] = await Promise.all([
    db.countrySave.findMany({ where: { shop }, select: { customerId: true, countryHandle: true } }),
    db.countryTravel.findMany({ where: { shop }, select: { customerId: true, countryHandle: true } }),
  ]);
  const members = new Set<string>();
  const perCountry = new Map<string, Set<string>>();
  for (const r of [...saves, ...travels]) {
    members.add(r.customerId);
    const set = perCountry.get(r.countryHandle) ?? new Set<string>();
    set.add(r.customerId);
    perCountry.set(r.countryHandle, set);
  }
  const countries = [...perCountry.entries()]
    .map(([handle, set]) => ({ handle, members: set.size }))
    .sort((a, b) => b.members - a.members || (a.handle < b.handle ? -1 : 1))
    .slice(0, take);
  return { members: members.size, countries };
}
