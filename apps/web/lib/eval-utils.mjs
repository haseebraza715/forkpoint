/**
 * Shared evaluation utilities for eval scripts.
 * This is the JavaScript (ESM) version for use by Node.js scripts.
 */

/**
 * Allowed violation IDs - only these are valid in eval results.
 */
export const ALLOWED_VIOLATIONS = new Set([
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

/**
 * Required agents that must have eval entries.
 */
export const REQUIRED_AGENTS = ["editor", "definer", "skeptic", "coach"];

/**
 * Violation severity weights for score calculation.
 *
 * Weight hierarchy rationale:
 * - format_broken (15): Critical - output is unusable if format is wrong
 * - editor_causal_inference, editor_adds_new_ideas (12): High - editor role drift
 *   distorts the author's meaning, which is the core purpose
 * - definer_not_in_text, coach_identity_injection, redundancy_severe (10):
 *   Medium-high - significant role violations or quality issues
 * - definer_no_operational_defs, skeptic_over_explains, skeptic_not_threatening,
 *   coach_options_not_distinct (8): Medium - partial failures that don't
 *   completely compromise the output
 */
export const VIOLATION_WEIGHTS = {
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

/**
 * Maps violations to their responsible agent.
 */
export const VIOLATION_AGENT = {
  editor_causal_inference: "editor",
  editor_adds_new_ideas: "editor",
  definer_not_in_text: "definer",
  definer_no_operational_defs: "definer",
  skeptic_over_explains: "skeptic",
  skeptic_not_threatening: "skeptic",
  coach_identity_injection: "coach",
  coach_options_not_distinct: "coach"
};

/**
 * Calculate score from violations.
 */
export function normalizeScore(violations) {
  const totalPenalty = violations.reduce(
    (sum, violation) => sum + (VIOLATION_WEIGHTS[violation] ?? 5),
    0
  );
  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

/**
 * Filter and deduplicate violations to only allowed IDs.
 */
export function sanitizeViolations(violations) {
  const list = Array.isArray(violations) ? violations : [];
  const filtered = list.filter((item) => ALLOWED_VIOLATIONS.has(item));
  return Array.from(new Set(filtered));
}

/**
 * Validate eval result (basic version for scripts).
 */
export function validateEvalResultBasic(result, transcript) {
  const errors = [];

  // Violations validation
  const violations = Array.isArray(result.violations) ? result.violations : [];
  result.violations = Array.from(new Set(violations.filter((item) => ALLOWED_VIOLATIONS.has(item))));
  const invalidViolations = violations.filter((item) => !ALLOWED_VIOLATIONS.has(item));
  if (invalidViolations.length > 0) {
    errors.push(`invalid_violations:${invalidViolations.join(",")}`);
  }

  // Verdict-violation consistency
  if (violations.length === 0 && result.verdict === "fail") {
    errors.push("verdict_fail_without_violations");
  }
  if (violations.length > 0 && result.verdict === "pass") {
    errors.push("verdict_pass_with_violations");
  }

  // Evidence validation
  const agentEvals = result.agentEvals || {};
  for (const evalEntry of Object.values(agentEvals)) {
    if (evalEntry?.rolePurityEvidence && !transcript.includes(evalEntry.rolePurityEvidence)) {
      errors.push("role_evidence_not_in_transcript");
    }
    if (evalEntry?.formatEvidence && !transcript.includes(evalEntry.formatEvidence)) {
      errors.push("format_evidence_not_in_transcript");
    }
  }

  // Agent evidence for violations
  for (const violation of result.violations) {
    const agent = VIOLATION_AGENT[violation];
    if (agent && !agentEvals[agent]?.rolePurityEvidence) {
      errors.push(`missing_role_evidence_for:${violation}`);
    }
  }

  // Format evidence requirement
  if (result.violations.includes("format_broken")) {
    const hasFormatEvidence = Object.values(agentEvals).some(
      (evalEntry) => evalEntry?.formatEvidence
    );
    if (!hasFormatEvidence) {
      errors.push("missing_format_evidence");
    }
  }

  // Redundancy evidence requirement
  if (result.violations.includes("redundancy_severe")) {
    if (!result.redundancy?.overlappingPoints?.length) {
      errors.push("missing_redundancy_evidence");
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Full validation aligned with lib/eval.ts for scripts that need strict checks.
 */
export function validateEvalResult(result, transcript) {
  const errors = [];

  if (!result.evalReasoning || typeof result.evalReasoning !== "string") {
    errors.push("missing_eval_reasoning");
  }

  if (!result.redundancy?.severity) {
    errors.push("missing_redundancy_severity");
  } else if (!["none", "minor", "severe"].includes(result.redundancy.severity)) {
    errors.push("invalid_redundancy_severity");
  }

  if (!["pass", "fail", "flag"].includes(result.verdict)) {
    errors.push("invalid_verdict");
  }

  if (typeof result.overallScore !== "number" || result.overallScore < 0 || result.overallScore > 100) {
    errors.push("invalid_score");
  }

  const rawViolations = Array.isArray(result.violations) ? result.violations : [];
  const invalidViolations = rawViolations.filter((item) => !ALLOWED_VIOLATIONS.has(item));
  const violations = sanitizeViolations(rawViolations);
  result.violations = violations;
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
  for (const agent of REQUIRED_AGENTS) {
    const evalEntry = agentEvals[agent];
    if (!evalEntry) {
      errors.push(`missing_agent_eval:${agent}`);
      continue;
    }
    if (!evalEntry.rolePurity || !evalEntry.rolePurityEvidence) {
      errors.push(`missing_role_purity:${agent}`);
    }
    if (!evalEntry.formatCompliance) {
      errors.push(`missing_format_compliance:${agent}`);
    }
    if (!evalEntry.pressureLevel) {
      errors.push(`missing_pressure_level:${agent}`);
    }
    if (evalEntry.rolePurityEvidence && !transcript.includes(evalEntry.rolePurityEvidence)) {
      errors.push("role_evidence_not_in_transcript");
    }
    if (
      evalEntry.formatCompliance !== "compliant" &&
      (!evalEntry.formatEvidence || !transcript.includes(evalEntry.formatEvidence))
    ) {
      errors.push("format_evidence_missing_or_invalid");
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

/**
 * Build transcript from entry and feedback array.
 */
export function buildTranscriptFromFeedback(entry, feedback) {
  const entryTitle = entry.title
    ? `ENTRY TITLE:\n${entry.title}`
    : "ENTRY TITLE:\n(untitled)";
  const entryBody = `ENTRY BODY:\n${entry.body}`;
  const agentSections = feedback
    .map((item) => `AGENT ${item.agent.toUpperCase()}:\n${item.content}`)
    .join("\n\n");
  return `${entryTitle}\n\n${entryBody}\n\n${agentSections}`;
}

/**
 * Build transcript from entry object and outputs map.
 */
export function buildTranscriptFromMap(entry, outputs) {
  const entryTitle = entry.title
    ? `ENTRY TITLE:\n${entry.title}`
    : "ENTRY TITLE:\n(untitled)";
  const entryBody = `ENTRY BODY:\n${entry.body}`;
  const agentSections = Object.entries(outputs)
    .map(([agent, content]) => `AGENT ${agent.toUpperCase()}:\n${content}`)
    .join("\n\n");
  return `${entryTitle}\n\n${entryBody}\n\n${agentSections}`;
}

/**
 * Parse JSON with recovery for common LLM output issues.
 */
export function tryParseJSON(content) {
  // First try direct parse
  try {
    return JSON.parse(content);
  } catch {
    // Try to extract JSON from response
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const jsonStr = content.slice(start, end + 1);
      try {
        return JSON.parse(jsonStr);
      } catch {
        // Try to fix trailing commas
        try {
          const fixed = jsonStr.replace(/,\s*([}\]])/g, "$1");
          return JSON.parse(fixed);
        } catch (finalError) {
          throw new Error(
            `JSON parse failed: ${finalError.message} (position ${finalError.message.match(/position (\d+)/)?.[1] || "unknown"})`
          );
        }
      }
    }
    throw new Error(`No JSON found in response`);
  }
}
