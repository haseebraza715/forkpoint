import { NextResponse } from "next/server";
import crypto from "crypto";

import { ObjectId, getDb } from "@/lib/mongodb";
import { PROMPT_VERSION } from "@/lib/prompts";
import { buildTranscript, runEval, type EvalResult } from "@/lib/eval";

type EvalRequest = {
  entryId: string;
  force?: boolean;
};

export async function POST(request: Request) {
  try {
    if (process.env.EVAL_MODE !== "true") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await request.json()) as EvalRequest;
    const entryIdValue = body?.entryId;

    if (!entryIdValue || !ObjectId.isValid(entryIdValue)) {
      return NextResponse.json({ error: "Invalid entry id" }, { status: 400 });
    }

    const db = await getDb();
    const entryId = new ObjectId(entryIdValue);

    if (!body.force) {
      const existing = await db
        .collection("evaluations")
        .find({ entryId })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();
      if (existing.length > 0) {
        return NextResponse.json({ evaluation: existing[0].result });
      }
    }

    const entry = await db.collection("entries").findOne({ _id: entryId });
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const feedback = await db
      .collection("feedback")
      .find({ entryId })
      .sort({ agent: 1 })
      .toArray();

    if (feedback.length === 0) {
      return NextResponse.json({ error: "No feedback to evaluate" }, { status: 400 });
    }

    const transcript = buildTranscript({
      entryTitle: entry.title ?? null,
      entryBody: entry.body,
      agentOutputs: feedback.map((item) => ({
        agent: item.agent,
        content: item.content
      }))
    });

    const model = feedback[0]?.model || process.env.OPENROUTER_MODEL || "unknown";
    const { parsed, modelUsed } = await runEval({
      entryId: entryId.toString(),
      promptVersion: PROMPT_VERSION,
      model,
      transcript
    });

    const result: EvalResult = {
      ...parsed,
      evalId: parsed.evalId || crypto.randomUUID(),
      entryId: entryId.toString(),
      promptVersion: PROMPT_VERSION,
      model: modelUsed,
      timestamp: parsed.timestamp || new Date().toISOString(),
      fullTranscript: transcript
    };

    await db.collection("evaluations").insertOne({
      entryId,
      promptVersion: PROMPT_VERSION,
      result,
      createdAt: new Date()
    });

    return NextResponse.json({ evaluation: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
