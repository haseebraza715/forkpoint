import { MongoClient, ObjectId } from "mongodb";
import { readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";

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

function buildTranscript(entry, feedback) {
  const entryTitle = entry.title ? `ENTRY TITLE:\n${entry.title}` : "ENTRY TITLE:\n(untitled)";
  const entryBody = `ENTRY BODY:\n${entry.body}`;
  const agentSections = feedback
    .map((item) => `AGENT ${item.agent.toUpperCase()}:\n${item.content}`)
    .join("\n\n");
  return `${entryTitle}\n\n${entryBody}\n\n${agentSections}`;
}

async function callOpenRouter(prompt, transcript) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_EVAL_MODEL || process.env.OPENROUTER_MODEL;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  if (!model) {
    throw new Error("OPENROUTER_EVAL_MODEL or OPENROUTER_MODEL is not set");
  }

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
      max_tokens: 2000,
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `TRANSCRIPT TO EVALUATE:\n${transcript}\n\nCURRENT PROMPT VERSION:\n${promptVersion}`
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
  const allowedViolations = new Set([
    "editor_causal_inference",
    "editor_adds_new_ideas",
    "definer_not_in_text",
    "definer_no_operational_defs",
    "skeptic_over_explains",
    "skeptic_not_threatening",
    "coach_identity_injection",
    "coach_options_not_distinct",
    "format_broken",
    "redundancy_severe"
  ]);
  const violationAgent = {
    editor_causal_inference: "editor",
    editor_adds_new_ideas: "editor",
    definer_not_in_text: "definer",
    definer_no_operational_defs: "definer",
    skeptic_over_explains: "skeptic",
    skeptic_not_threatening: "skeptic",
    coach_identity_injection: "coach",
    coach_options_not_distinct: "coach"
  };

  function validateEval(result, transcript) {
    const errors = [];
    const violations = Array.isArray(result.violations) ? result.violations : [];
    const invalidViolations = violations.filter((item) => !allowedViolations.has(item));
    if (invalidViolations.length > 0) {
      errors.push(`invalid_violations:${invalidViolations.join(",")}`);
    }
    if (violations.length === 0 && result.verdict === "fail") {
      errors.push("verdict_fail_without_violations");
    }
    if (violations.length > 0 && result.verdict === "pass") {
      errors.push("verdict_pass_with_violations");
    }
    const agentEvals = result.agentEvals || {};
    for (const evalEntry of Object.values(agentEvals)) {
      if (evalEntry?.rolePurityEvidence && !transcript.includes(evalEntry.rolePurityEvidence)) {
        errors.push("role_evidence_not_in_transcript");
      }
      if (evalEntry?.formatEvidence && !transcript.includes(evalEntry.formatEvidence)) {
        errors.push("format_evidence_not_in_transcript");
      }
    }
    for (const violation of violations) {
      const agent = violationAgent[violation];
      if (agent && !agentEvals[agent]?.rolePurityEvidence) {
        errors.push(`missing_role_evidence_for:${violation}`);
      }
    }
    if (violations.includes("format_broken")) {
      const hasFormatEvidence = Object.values(agentEvals).some(
        (evalEntry) => evalEntry?.formatEvidence
      );
      if (!hasFormatEvidence) {
        errors.push("missing_format_evidence");
      }
    }
    if (violations.includes("redundancy_severe")) {
      if (!result.redundancy?.overlappingPoints?.length) {
        errors.push("missing_redundancy_evidence");
      }
    }
    return { ok: errors.length === 0, errors };
  }

  for (const entry of entries) {
    const entryId = entry._id;
    const feedback = await feedbackCollection
      .find({ entryId })
      .sort({ agent: 1 })
      .toArray();

    if (feedback.length === 0) {
      continue;
    }

    const transcript = buildTranscript(entry, feedback);
    const { content, model } = await callOpenRouter(prompt, transcript);

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(content.slice(start, end + 1));
        } catch (innerError) {
          failures.push({ entryId: entryId.toString(), reason: "Invalid JSON" });
          continue;
        }
      } else {
        failures.push({ entryId: entryId.toString(), reason: "Invalid JSON" });
        continue;
      }
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

    const validation = validateEval(result, transcript);
    if (!validation.ok) {
      failures.push({
        entryId: entryId.toString(),
        reason: `Eval validation failed: ${validation.errors.join(", ")}`
      });
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

    console.log(`[eval] ${entryId.toString()} verdict=${result.verdict}`);
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
