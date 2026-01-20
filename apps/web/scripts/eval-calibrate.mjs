import { readFile } from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const baseDir = process.cwd();
const promptPath = path.join(baseDir, "eval", "eval-prompt.txt");
const calibrationPath = path.join(baseDir, "eval", "golden", "calibration.json");

function buildTranscript(entry, outputs) {
  const entryTitle = entry.title ? `ENTRY TITLE:\n${entry.title}` : "ENTRY TITLE:\n(untitled)";
  const entryBody = `ENTRY BODY:\n${entry.body}`;
  const agentSections = Object.entries(outputs)
    .map(([agent, content]) => `AGENT ${agent.toUpperCase()}:\n${content}`)
    .join("\n\n");
  return `${entryTitle}\n\n${entryBody}\n\n${agentSections}`;
}

async function callOpenRouter(prompt, transcript, promptVersion) {
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
  const [prompt, calibrationRaw] = await Promise.all([
    readFile(promptPath, "utf8"),
    readFile(calibrationPath, "utf8")
  ]);

  const calibration = JSON.parse(calibrationRaw);
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

  for (const entry of calibration.cases) {
    const casePath = path.join(baseDir, "eval", "golden", entry.path);
    const caseRaw = await readFile(casePath, "utf8");
    const data = JSON.parse(caseRaw);

    const transcript = buildTranscript(data.entry, data.outputs);
    const { content, model } = await callOpenRouter(
      prompt,
      transcript,
      calibration.version
    );

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
          failures.push({
            id: entry.id,
            reason: "Eval output is not valid JSON",
            detail: content.slice(0, 200)
          });
          continue;
        }
      } else {
        failures.push({
          id: entry.id,
          reason: "Eval output is not valid JSON",
          detail: content.slice(0, 200)
        });
        continue;
      }
    }

    const validation = validateEval(parsed, transcript);
    if (!validation.ok) {
      failures.push({
        id: entry.id,
        reason: `Eval validation failed: ${validation.errors.join(", ")}`
      });
      continue;
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

    console.log(`[${entry.id}] verdict=${parsed.verdict} model=${model}`);
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
