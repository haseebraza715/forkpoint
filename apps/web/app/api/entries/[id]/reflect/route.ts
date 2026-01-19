import { NextResponse } from "next/server";

import { ObjectId, getDb } from "@/lib/mongodb";
import { callOpenRouter } from "@/lib/openrouter";
import { PROMPT_VERSION, PROMPTS, SHARED_RULES } from "@/lib/prompts";
import { writeReflectionSnapshot } from "@/lib/reflection-store";

const AGENTS = ["editor", "skeptic", "coach"] as const;

type AgentName = (typeof AGENTS)[number];

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: RouteParams) {
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

    const existingFeedback = await db
      .collection("feedback")
      .find({ entryId })
      .sort({ agent: 1 })
      .toArray();

    if (existingFeedback.length >= AGENTS.length) {
      const mappedFeedback = existingFeedback.map((item) => ({
        id: item._id.toString(),
        entryId: item.entryId.toString(),
        agent: item.agent,
        content: item.content,
        createdAt: item.createdAt,
        model: item.model,
        promptVersion: item.promptVersion
      }));
      return NextResponse.json({
        entryId: entryId.toString(),
        feedback: mappedFeedback
      });
    }

    const model = process.env.OPENROUTER_MODEL;
    if (!model) {
      return NextResponse.json(
        { error: "OPENROUTER_MODEL is not set" },
        { status: 500 }
      );
    }

    const userText = entry.title
      ? `Title: ${entry.title}\n\n${entry.body}`
      : entry.body;

    const feedbackDocs = await Promise.all(
      AGENTS.map(async (agent) => {
        const systemPrompt = `${SHARED_RULES}\n\n${PROMPTS[agent]}`;
        const content = await callOpenRouter({
          model,
          temperature: 0.4,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText }
          ]
        });

        return {
          entryId,
          agent,
          content,
          createdAt: new Date(),
          model,
          promptVersion: PROMPT_VERSION
        };
      })
    );

    if (feedbackDocs.length > 0) {
      await db.collection("feedback").insertMany(feedbackDocs);
      await db
        .collection("entries")
        .updateOne(
          { _id: entryId },
          { $set: { status: "reflected", updatedAt: new Date() } }
        );
    }

    const mappedFeedback = feedbackDocs.map((item) => ({
      entryId: item.entryId.toString(),
      agent: item.agent,
      content: item.content,
      createdAt: item.createdAt,
      model: item.model,
      promptVersion: item.promptVersion
    }));

    try {
      const storedEntry = await db.collection("entries").findOne({ _id: entryId });
      const storedFeedback = await db
        .collection("feedback")
        .find({ entryId })
        .sort({ agent: 1 })
        .toArray();

      if (storedEntry) {
        await writeReflectionSnapshot({
          entry: {
            id: storedEntry._id.toString(),
            title: storedEntry.title ?? null,
            body: storedEntry.body,
            createdAt: storedEntry.createdAt,
            updatedAt: storedEntry.updatedAt,
            status: storedEntry.status,
            wordCount: storedEntry.wordCount
          },
          feedback: storedFeedback.map((item) => ({
            id: item._id.toString(),
            entryId: item.entryId.toString(),
            agent: item.agent,
            content: item.content,
            createdAt: item.createdAt,
            model: item.model,
            promptVersion: item.promptVersion
          }))
        });
      }
    } catch (snapshotError) {
      console.error(snapshotError);
    }

    return NextResponse.json({
      entryId: entryId.toString(),
      feedback: mappedFeedback
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
