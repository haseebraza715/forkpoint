import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

export async function GET() {
  const db = await getDb();
  const doc = await db.collection("status").findOne({ key: "example" });
  return NextResponse.json({ ok: true, data: doc });
}

export async function POST() {
  const db = await getDb();
  const now = new Date();
  await db.collection("status").updateOne(
    { key: "example" },
    { $set: { key: "example", updatedAt: now } },
    { upsert: true }
  );
  return NextResponse.json({ ok: true, updatedAt: now.toISOString() });
}
