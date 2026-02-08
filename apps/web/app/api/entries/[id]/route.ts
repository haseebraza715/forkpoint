import { NextResponse } from "next/server";

import { formatDbError } from "@/lib/api-errors";
import { ObjectId, getDb } from "@/lib/mongodb";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string }>;
};

function countWords(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid entry id" }, { status: 400 });
    }

    const db = await getDb();
    const entryId = new ObjectId(id);
    const entry = await db.collection("entries").findOne({ _id: entryId });

    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const feedback = await db
      .collection("feedback")
      .find({ entryId })
      .sort({ agent: 1 })
      .toArray();

    const mappedEntry = {
      id: entry._id.toString(),
      title: entry.title ?? null,
      body: entry.body,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      status: entry.status,
      wordCount: entry.wordCount
    };

    const mappedFeedback = feedback.map((item) => ({
      id: item._id.toString(),
      entryId: item.entryId.toString(),
      agent: item.agent,
      content: item.content,
      createdAt: item.createdAt,
      model: item.model,
      promptVersion: item.promptVersion
    }));

    return NextResponse.json({ entry: mappedEntry, feedback: mappedFeedback });
  } catch (error) {
    const message = formatDbError(error, "Failed to load entry.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid entry id" }, { status: 400 });
    }

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : null;
    const entryBody = typeof body.body === "string" ? body.body.trim() : "";

    if (!entryBody) {
      return NextResponse.json({ error: "Body is required" }, { status: 400 });
    }

    const db = await getDb();
    const entryId = new ObjectId(id);
    const existingEntry = await db.collection("entries").findOne({ _id: entryId });

    if (!existingEntry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const updatedEntry = {
      title: title && title.length > 0 ? title : null,
      body: entryBody,
      updatedAt: new Date(),
      wordCount: countWords(entryBody),
      status: "draft"
    };

    await db.collection("entries").updateOne({ _id: entryId }, { $set: updatedEntry });
    await db.collection("feedback").deleteMany({ entryId });

    return NextResponse.json({
      entry: {
        id: entryId.toString(),
        title: updatedEntry.title,
        body: updatedEntry.body,
        createdAt: existingEntry.createdAt,
        updatedAt: updatedEntry.updatedAt,
        status: updatedEntry.status,
        wordCount: updatedEntry.wordCount
      },
      feedback: []
    });
  } catch (error) {
    const message = formatDbError(error, "Could not update entry.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid entry id" }, { status: 400 });
    }

    const db = await getDb();
    const entryId = new ObjectId(id);

    const result = await db.collection("entries").deleteOne({ _id: entryId });
    await db.collection("feedback").deleteMany({ entryId });

    if (!result.deletedCount) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, entryId: entryId.toString() });
  } catch (error) {
    const message = formatDbError(error, "Could not delete entry.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
