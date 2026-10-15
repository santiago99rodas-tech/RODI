-- Route map (Club): coordinates and a note on activities, and places saved on the map that are not in a day yet. Additive only.
ALTER TABLE "Activity" ADD COLUMN "lat" REAL;
ALTER TABLE "Activity" ADD COLUMN "lng" REAL;
ALTER TABLE "Activity" ADD COLUMN "note" TEXT;

CREATE TABLE "TripPlace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "note" TEXT,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripPlace_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TripPlace_tripId_idx" ON "TripPlace"("tripId");
