import { readFile } from "fs/promises";
import path from "path";
import dotenv from "dotenv";

import {
  normalizeScore,
  sanitizeViolations,
  validateEvalResult,
  buildTranscriptFromMap,
  tryParseJSON
} from "../lib/eval-utils.mjs";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const baseDir = process.cwd();
const promptPath = path.join(baseDir, "eval", "eval-prompt.txt");
const calibrationPath = path.join(baseDir, "eval", "golden", "calibration.json");

async function callOpenRouter(prompt, transcript, promptVersion, extraInstruction) {
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
  const [prompt, calibrationRaw] = await Promise.all([
    readFile(promptPath, "utf8"),
    readFile(calibrationPath, "utf8")
  ]);

  const calibration = JSON.parse(calibrationRaw);
  const failures = [];

  for (const entry of calibration.cases) {
    const casePath = path.join(baseDir, "eval", "golden", entry.path);
    const caseRaw = await readFile(casePath, "utf8");
    const data = JSON.parse(caseRaw);

    const transcript = buildTranscriptFromMap(data.entry, data.outputs);
    const { content, model } = await callOpenRouter(prompt, transcript, calibration.version);

    let parsed;
    try {
      parsed = tryParseJSON(content);
    } catch (error) {
      failures.push({
        id: entry.id,
        reason: "Eval output is not valid JSON",
        detail: content.slice(0, 200)
      });
      continue;
    }

    const validation = validateEval(parsed, transcript);
    if (!validation.ok) {
      const { content: retryContent } = await callOpenRouter(
        prompt,
        transcript,
        calibration.version,
        validation.errors.join("; ")
      );
      try {
        parsed = tryParseJSON(retryContent);
      } catch (error) {
        failures.push({
          id: entry.id,
          reason: "Eval output is not valid JSON after retry",
          detail: retryContent.slice(0, 200)
        });
        continue;
      }
      parsed.violations = sanitizeViolations(parsed.violations);
      parsed.overallScore = normalizeScore(parsed.violations);
      const retryValidation = validateEval(parsed, transcript);
      if (!retryValidation.ok) {
        failures.push({
          id: entry.id,
          reason: `Eval validation failed: ${retryValidation.errors.join(", ")}`
        });
        continue;
      }
    }

    const expectedVerdict = entry.expectedVerdict;
    if (parsed.verdict !== expectedVerdict) {
      failures.push({
        id: entry.id,
        reason: `Verdict mismatch (expected ${expectedVerdict}, got ${parsed.verdict})`
      });
    }

    const expectedViolations = entry.expectedViolations || [];
    const actualViolations = Array.isArray(parsed.violations) ? parsed.violations : [];
    const missing = expectedViolations.filter((v) => !actualViolations.includes(v));

    if (missing.length > 0) {
      failures.push({
        id: entry.id,
        reason: `Missing violations: ${missing.join(", ")}`,
        detail: actualViolations
      });
    }

    console.log(`[${entry.id}] verdict=${parsed.verdict} score=${parsed.overallScore} model=${model}`);
  }

  if (failures.length > 0) {
    console.error("\nCalibration failed:");
    for (const failure of failures) {
      console.error(`- ${failure.id}: ${failure.reason}`);
      if (failure.detail) {
        console.error(`  detail: ${JSON.stringify(failure.detail).slice(0, 200)}`);
      }
    }
    process.exit(1);
  }

  console.log("\nCalibration passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
