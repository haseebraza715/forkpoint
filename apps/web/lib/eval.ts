import { readFileSync } from "fs";
import path from "path";

import { callOpenRouter } from "@/lib/openrouter";
import {
  type EvalResult,
  type EvalVerdict,
  type RolePurity,
  type FormatCompliance,
  type PressureLevel,
  type RedundancySeverity,
  sanitizeViolations,
  normalizeScore,
  validateEvalResult,
  buildTranscript,
  tryParseJSON
} from "@/lib/eval-utils";

// Re-export types for backwards compatibility
export type {
  EvalResult,
  EvalVerdict,
  RolePurity,
  FormatCompliance,
  PressureLevel,
  RedundancySeverity
};

// Re-export utilities for backwards compatibility
export { buildTranscript };

type EvalInput = {
  entryId: string;
  promptVersion: string;
  model: string;
  transcript: string;
};

const evalPromptPath = path.join(process.cwd(), "eval", "eval-prompt.txt");
const EVAL_PROMPT = readFileSync(evalPromptPath, "utf8");

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
    parsed = tryParseJSON<EvalResult>(content);
  } catch {
    throw new Error(`Eval output is not valid JSON: ${content.slice(0, 200)}`);
  }

  parsed.violations = sanitizeViolations(parsed.violations);
  parsed.overallScore = normalizeScore(parsed.violations);
  const validation = validateEvalResult(parsed, input.transcript);

  if (!validation.ok) {
    const retryContent = await callOpenRouter({
      model,
      temperature: 0,
      max_tokens: 2000,
      messages: buildMessages(validation.errors.join("; "))
    });

    try {
      parsed = tryParseJSON<EvalResult>(retryContent);
    } catch {
      throw new Error(`Eval output is not valid JSON: ${retryContent.slice(0, 200)}`);
    }

    parsed.violations = sanitizeViolations(parsed.violations);
    parsed.overallScore = normalizeScore(parsed.violations);
    const retryValidation = validateEvalResult(parsed, input.transcript);
    if (!retryValidation.ok) {
      throw new Error(`Eval output failed validation: ${retryValidation.errors.join(", ")}`);
    }
  }

  return { parsed, modelUsed: model };
}
