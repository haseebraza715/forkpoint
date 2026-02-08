import { NextResponse } from "next/server";

import { ObjectId, getDb } from "@/lib/mongodb";
import { callOpenRouter } from "@/lib/openrouter";
import {
  getAgentMaxTokens,
  getAgentModel,
  getAgentModelEnvKey,
  getMissingAgentModels
} from "@/lib/model-config";
import { PROMPT_VERSION, PROMPTS, SHARED_RULES } from "@/lib/prompts";
import { writeReflectionSnapshot } from "@/lib/reflection-store";

const AGENTS = ["editor", "definer", "risk", "skeptic", "coach"] as const;

type AgentName = (typeof AGENTS)[number];

type RouteParams = {
  params: Promise<{ id: string }>;
};

function jsonLine(data: unknown) {
  return `${JSON.stringify(data)}\n`;
}

export async function POST(_request: Request, { params }: RouteParams) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { id } = await params;
        if (!ObjectId.isValid(id)) {
          controller.enqueue(
            encoder.encode(jsonLine({ type: "error", message: "Invalid entry id" }))
          );
          controller.close();
          return;
        }

        const db = await getDb();
        const entryId = new ObjectId(id);
        const entry = await db.collection("entries").findOne({ _id: entryId });

        if (!entry) {
          controller.enqueue(
            encoder.encode(jsonLine({ type: "error", message: "Entry not found" }))
          );
          controller.close();
          return;
        }

        const missingModels = getMissingAgentModels(AGENTS);
        if (missingModels.length > 0) {
          const hintKeys = Array.from(
            new Set(missingModels.map((agent) => getAgentModelEnvKey(agent)))
          );
          controller.enqueue(
            encoder.encode(
              jsonLine({
                type: "error",
                message: `Missing OpenRouter model for agents: ${missingModels.join(", ")}`,
                hint: `Set ${hintKeys.join(", ")}`
              })
            )
          );
          controller.close();
          return;
        }

        const existingFeedback = await db.collection("feedback").find({ entryId }).toArray();
        const existingMap = new Map<AgentName, boolean>();

        existingFeedback.forEach((item) => {
          if (AGENTS.includes(item.agent as AgentName)) {
            existingMap.set(item.agent as AgentName, true);
          }
        });

        if (existingFeedback.length > 0) {
          for (const item of existingFeedback) {
            controller.enqueue(
              encoder.encode(
                jsonLine({
                  type: "feedback",
                  data: {
                    entryId: item.entryId.toString(),
                    agent: item.agent,
                    content: item.content,
                    createdAt: item.createdAt,
                    model: item.model,
                    promptVersion: item.promptVersion
                  }
                })
              )
            );
          }
        }

        const userText = entry.title
          ? `Title: ${entry.title}\n\n${entry.body}`
          : entry.body;

        for (const agent of AGENTS) {
          if (existingMap.get(agent)) {
            continue;
          }

          const model = getAgentModel(agent) as string;
          const systemPrompt = `${SHARED_RULES}\n\n${PROMPTS[agent]}`;
          const max_tokens = getAgentMaxTokens(agent);
          const content = await callOpenRouter({
            model,
            temperature: 0.4,
            ...(max_tokens ? { max_tokens } : {}),
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userText }
            ]
          });

          const feedbackDoc = {
            entryId,
            agent,
            content,
            createdAt: new Date(),
            model,
            promptVersion: PROMPT_VERSION
          };

          await db.collection("feedback").insertOne(feedbackDoc);

          controller.enqueue(
            encoder.encode(
              jsonLine({
                type: "feedback",
                data: {
                  entryId: entryId.toString(),
                  agent,
                  content,
                  createdAt: feedbackDoc.createdAt,
                  model,
                  promptVersion: PROMPT_VERSION
                }
              })
            )
          );
        }

        await db
          .collection("entries")
          .updateOne(
            { _id: entryId },
            { $set: { status: "reflected", updatedAt: new Date() } }
          );

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

        controller.enqueue(encoder.encode(jsonLine({ type: "done" })));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(encoder.encode(jsonLine({ type: "error", message })));
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
