import { NextResponse } from "next/server";

import { getDb } from "@/lib/mongodb";

function countWords(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Number(limitParam ?? 50) || 50, 200);

  const db = await getDb();
  const entries = await db
    .collection("entries")
    .find(
      {},
      {
        projection: {
          title: 1,
          createdAt: 1,
          updatedAt: 1,
          status: 1,
          wordCount: 1
        }
      }
    )
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  const mappedEntries = entries.map((entry) => ({
    id: entry._id.toString(),
    title: entry.title ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    status: entry.status,
    wordCount: entry.wordCount
  }));

  return NextResponse.json({ entries: mappedEntries });
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : null;
  const entryBody = typeof body.body === "string" ? body.body.trim() : "";

  if (!entryBody) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }

  const now = new Date();
  const entry = {
    title: title && title.length > 0 ? title : null,
    body: entryBody,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    wordCount: countWords(entryBody)
  };

  const db = await getDb();
  const result = await db.collection("entries").insertOne(entry);

  return NextResponse.json({
    entryId: result.insertedId.toString(),
    entry: { id: result.insertedId.toString(), ...entry }
  });
}
