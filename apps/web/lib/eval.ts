import { readFileSync } from "fs";
import path from "path";

import { callOpenRouter } from "@/lib/openrouter";

export type EvalVerdict = "pass" | "fail" | "flag";
export type RolePurity = "clean" | "drift" | "hijack";
export type FormatCompliance = "compliant" | "minor_violation" | "broken";
export type PressureLevel = "too_soft" | "calibrated" | "too_harsh";
export type RedundancySeverity = "none" | "minor" | "severe";

export type EvalResult = {
  evalId: string;
  entryId: string;
  promptVersion: string;
  model: string;
  timestamp: string;
  verdict: EvalVerdict;
  overallScore: number;
  violations?: string[];
  agentEvals: Record<
    string,
    {
      rolePurity: RolePurity;
      rolePurityEvidence: string;
      formatCompliance: FormatCompliance;
      formatEvidence?: string;
      pressureLevel: PressureLevel;
    }
  >;
  redundancy: {
    severity: RedundancySeverity;
    overlappingPoints?: string[];
  };
  fixes: Array<{
    target: "system_prompt" | "agent_prompt" | "orchestration";
    agentName?: string;
    currentText: string;
    proposedText: string;
    rationale: string;
  }>;
  fullTranscript: string;
  evalReasoning: string;
};

type EvalInput = {
  entryId: string;
  promptVersion: string;
  model: string;
  transcript: string;
};

const ALLOWED_VIOLATIONS = new Set([
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

const VIOLATION_WEIGHTS: Record<string, number> = {
  editor_causal_inference: 12,
  editor_adds_new_ideas: 12,
  definer_not_in_text: 10,
  definer_no_operational_defs: 8,
  skeptic_over_explains: 8,
  skeptic_not_threatening: 8,
  coach_identity_injection: 10,
  coach_options_not_distinct: 8,
  format_broken: 15,
  redundancy_severe: 10
};

const VIOLATION_AGENT: Record<string, string> = {
  editor_causal_inference: "editor",
  editor_adds_new_ideas: "editor",
  definer_not_in_text: "definer",
  definer_no_operational_defs: "definer",
  skeptic_over_explains: "skeptic",
  skeptic_not_threatening: "skeptic",
  coach_identity_injection: "coach",
  coach_options_not_distinct: "coach"
};

const evalPromptPath = path.join(process.cwd(), "eval", "eval-prompt.txt");
const EVAL_PROMPT = readFileSync(evalPromptPath, "utf8");

function normalizeScore(violations: string[]) {
  const totalPenalty = violations.reduce(
    (sum, violation) => sum + (VIOLATION_WEIGHTS[violation] ?? 5),
    0
  );
  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

function validateEvalResult(result: EvalResult, transcript: string) {
  const errors: string[] = [];

  if (!["pass", "fail", "flag"].includes(result.verdict)) {
    errors.push("invalid_verdict");
  }

  if (typeof result.overallScore !== "number" || result.overallScore < 0 || result.overallScore > 100) {
    errors.push("invalid_score");
  }

  const violations = Array.isArray(result.violations) ? result.violations : [];
  const invalidViolations = violations.filter((item) => !ALLOWED_VIOLATIONS.has(item));
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
    if (evalEntry?.rolePurityEvidence) {
      if (!transcript.includes(evalEntry.rolePurityEvidence)) {
        errors.push("role_evidence_not_in_transcript");
      }
    }
    if (evalEntry?.formatEvidence) {
      if (!transcript.includes(evalEntry.formatEvidence)) {
        errors.push("format_evidence_not_in_transcript");
      }
    }
  }

  for (const violation of violations) {
    const agent = VIOLATION_AGENT[violation];
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

export function buildTranscript(input: {
  entryTitle: string | null;
  entryBody: string;
  agentOutputs: Array<{ agent: string; content: string }>;
}) {
  const entryHeader = input.entryTitle
    ? `ENTRY TITLE:\n${input.entryTitle}`
    : "ENTRY TITLE:\n(untitled)";

  const entryBody = `ENTRY BODY:\n${input.entryBody}`;

  const agentSections = input.agentOutputs
    .map((item) => `AGENT ${item.agent.toUpperCase()}:\n${item.content}`)
    .join("\n\n");

  return `${entryHeader}\n\n${entryBody}\n\n${agentSections}`;
}

export async function runEval(input: EvalInput) {
  const model = process.env.OPENROUTER_EVAL_MODEL || input.model;

  const buildMessages = (extraInstruction?: string) => [
    { role: "system" as const, content: EVAL_PROMPT },
    {
      role: "user" as const,
      content: `TRANSCRIPT TO EVALUATE:\n${input.transcript}\n\nCURRENT PROMPT VERSION:\n${input.promptVersion}${
        extraInstruction ? `\n\nVALIDATION_ERRORS:\n${extraInstruction}` : ""
      }`
    }
  ];

  const content = await callOpenRouter({
    model,
    temperature: 0.2,
    max_tokens: 2000,
    messages: buildMessages()
  });

  let parsed: EvalResult;
  try {
    parsed = JSON.parse(content) as EvalResult;
  } catch (error) {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    const candidate =
      start >= 0 && end > start ? content.slice(start, end + 1) : null;
    const match = candidate ? [candidate] : null;
    if (match) {
      try {
        parsed = JSON.parse(match[0]) as EvalResult;
      } catch (innerError) {
        throw new Error(`Eval output is not valid JSON: ${content.slice(0, 200)}`);
      }
    } else {
      throw new Error(`Eval output is not valid JSON: ${content.slice(0, 200)}`);
    }
  }

  parsed.overallScore = normalizeScore(parsed.violations ?? []);
  const validation = validateEvalResult(parsed, input.transcript);
  if (!validation.ok) {
    const retryContent = await callOpenRouter({
      model,
      temperature: 0,
      max_tokens: 2000,
      messages: buildMessages(validation.errors.join("; "))
    });

    try {
      parsed = JSON.parse(retryContent) as EvalResult;
    } catch (error) {
      const start = retryContent.indexOf("{");
      const end = retryContent.lastIndexOf("}");
      if (start >= 0 && end > start) {
        parsed = JSON.parse(retryContent.slice(start, end + 1)) as EvalResult;
      } else {
        throw new Error(`Eval output is not valid JSON: ${retryContent.slice(0, 200)}`);
      }
    }

    parsed.overallScore = normalizeScore(parsed.violations ?? []);
    const retryValidation = validateEvalResult(parsed, input.transcript);
    if (!retryValidation.ok) {
      throw new Error(`Eval output failed validation: ${retryValidation.errors.join(", ")}`);
    }
  }

  return { parsed, modelUsed: model };
}
