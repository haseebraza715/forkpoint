const AGENT_MODEL_ENV: Record<string, string> = {
  editor: "OPENROUTER_MODEL_EDITOR",
  definer: "OPENROUTER_MODEL_DEFINER",
  risk: "OPENROUTER_MODEL_RISK",
  skeptic: "OPENROUTER_MODEL_SKEPTIC",
  coach: "OPENROUTER_MODEL_COACH"
};
const AGENT_MAX_TOKENS_ENV: Record<string, string> = {
  editor: "OPENROUTER_MAX_TOKENS_EDITOR",
  definer: "OPENROUTER_MAX_TOKENS_DEFINER",
  risk: "OPENROUTER_MAX_TOKENS_RISK",
  skeptic: "OPENROUTER_MAX_TOKENS_SKEPTIC",
  coach: "OPENROUTER_MAX_TOKENS_COACH"
};

export function getAgentModel(agent: string) {
  const envKey = AGENT_MODEL_ENV[agent];
  if (envKey && process.env[envKey]) {
    return process.env[envKey];
  }
  return process.env.OPENROUTER_MODEL;
}

export function getMissingAgentModels(agents: readonly string[]) {
  const missing: string[] = [];
  for (const agent of agents) {
    if (!getAgentModel(agent)) {
      missing.push(agent);
    }
  }
  return missing;
}

export function getAgentModelEnvKey(agent: string) {
  return AGENT_MODEL_ENV[agent] ?? "OPENROUTER_MODEL";
}

export function getAgentMaxTokens(agent: string) {
  const envKey = AGENT_MAX_TOKENS_ENV[agent];
  const raw = envKey ? process.env[envKey] : undefined;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  const fallback = process.env.OPENROUTER_MAX_TOKENS;
  if (fallback) {
    const parsed = Number(fallback);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return undefined;
}

export function getAgentMaxTokensEnvKey(agent: string) {
  return AGENT_MAX_TOKENS_ENV[agent] ?? "OPENROUTER_MAX_TOKENS";
}
