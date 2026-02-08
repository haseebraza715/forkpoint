import { MongoClient, ObjectId } from "mongodb";
import { readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

import {
  normalizeScore,
  sanitizeViolations,
  validateEvalResult,
  buildTranscriptFromFeedback,
  tryParseJSON,
  ensureEvidenceInTranscript
} from "../lib/eval-utils.mjs";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const failOnArg = process.argv.find((arg) => arg.startsWith("--fail-on="));

const mode = modeArg ? modeArg.split("=")[1] : "recent";
const limit = limitArg ? Number(limitArg.split("=")[1]) : 10;
const failOn = failOnArg ? failOnArg.split("=")[1].split(",") : [];

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB;

if (!uri || !dbName) {
  throw new Error("MONGODB_URI or MONGODB_DB not set");
}

const promptPath = path.join(process.cwd(), "eval", "eval-prompt.txt");
const promptVersion = process.env.PROMPT_VERSION || "v1";

async function callOpenRouter(prompt, transcript, extraInstruction) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_EVAL_MODEL || process.env.OPENROUTER_MODEL;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  if (!model) {
    throw new Error("OPENROUTER_EVAL_MODEL or OPENROUTER_MODEL is not set");
  }

  const maxTokens = Number(process.env.OPENROUTER_EVAL_MAX_TOKENS || 2000);
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(process.env.OPENROUTER_APP_URL
        ? { "HTTP-Referer": process.env.OPENROUTER_APP_URL }
        : {}),
      ...(process.env.OPENROUTER_APP_NAME
        ? { "X-Title": process.env.OPENROUTER_APP_NAME }
        : {})
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: Number.isFinite(maxTokens) ? maxTokens : 2000,
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `TRANSCRIPT TO EVALUATE:\n${transcript}\n\nCURRENT PROMPT VERSION:\n${promptVersion}${
            extraInstruction ? `\n\nVALIDATION_ERRORS:\n${extraInstruction}` : ""
          }`
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned no content");
  }

  return { content, model };
}

function validateEval(result, transcript) {
  const rawViolations = Array.isArray(result.violations) ? result.violations : [];
  result.violations = sanitizeViolations(rawViolations);
  result.overallScore = normalizeScore(result.violations);
  return validateEvalResult(result, transcript);
}

async function run() {
  const prompt = await readFile(promptPath, "utf8");
  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db(dbName);
  const entriesCollection = db.collection("entries");
  const feedbackCollection = db.collection("feedback");
  const evaluationsCollection = db.collection("evaluations");

  let entries = [];
  if (mode === "random") {
    entries = await entriesCollection
      .aggregate([{ $sample: { size: limit } }])
      .toArray();
  } else {
    entries = await entriesCollection.find().sort({ createdAt: -1 }).limit(limit).toArray();
  }

  const failures = [];

  for (const entry of entries) {
    const entryId = entry._id;
    const feedback = await feedbackCollection
      .find({ entryId })
      .sort({ agent: 1 })
      .toArray();

    if (feedback.length === 0) {
      continue;
    }

    const transcript = buildTranscriptFromFeedback(entry, feedback);
    const { content, model } = await callOpenRouter(prompt, transcript);

    let parsed;
    try {
      parsed = tryParseJSON(content);
    } catch {
      failures.push({ entryId: entryId.toString(), reason: "Invalid JSON" });
      continue;
    }

    const result = {
      ...parsed,
      evalId: parsed.evalId || crypto.randomUUID(),
      entryId: entryId.toString(),
      promptVersion,
      model,
      timestamp: parsed.timestamp || new Date().toISOString(),
      fullTranscript: transcript
    };

    ensureEvidenceInTranscript(result, transcript);
    const validation = validateEval(result, transcript);
    if (!validation.ok) {
      const { content: retryContent } = await callOpenRouter(
        prompt,
        transcript,
        validation.errors.join("; ")
      );
      try {
        parsed = tryParseJSON(retryContent);
      } catch {
        failures.push({
          entryId: entryId.toString(),
          reason: "Invalid JSON after retry"
        });
        continue;
      }
      const retryResult = {
        ...parsed,
        evalId: parsed.evalId || crypto.randomUUID(),
        entryId: entryId.toString(),
        promptVersion,
        model,
        timestamp: parsed.timestamp || new Date().toISOString(),
        fullTranscript: transcript
      };
      ensureEvidenceInTranscript(retryResult, transcript);
      const retryValidation = validateEval(retryResult, transcript);
      if (!retryValidation.ok) {
        failures.push({
          entryId: entryId.toString(),
          reason: `Eval validation failed: ${retryValidation.errors.join(", ")}`
        });
        continue;
      }
      await evaluationsCollection.insertOne({
        entryId: new ObjectId(entryId),
        promptVersion,
        result: retryResult,
        createdAt: new Date()
      });
      if (failOn.includes(retryResult.verdict)) {
        failures.push({ entryId: entryId.toString(), reason: `Verdict ${retryResult.verdict}` });
      }
      console.log(
        `[eval] ${entryId.toString()} verdict=${retryResult.verdict} score=${retryResult.overallScore}`
      );
      continue;
    }

    await evaluationsCollection.insertOne({
      entryId: new ObjectId(entryId),
      promptVersion,
      result,
      createdAt: new Date()
    });

    if (failOn.includes(result.verdict)) {
      failures.push({ entryId: entryId.toString(), reason: `Verdict ${result.verdict}` });
    }

    console.log(`[eval] ${entryId.toString()} verdict=${result.verdict} score=${result.overallScore}`);
  }

  await client.close();

  if (failures.length > 0) {
    console.error("\nBatch eval failed:");
    for (const failure of failures) {
      console.error(`- ${failure.entryId}: ${failure.reason}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
