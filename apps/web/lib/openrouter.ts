type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterRequest = {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
};

type OpenRouterResponse = {
  choices?: { message?: { content?: string } }[];
};

export async function callOpenRouter(payload: OpenRouterRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const referer = process.env.OPENROUTER_APP_URL;
  const title = process.env.OPENROUTER_APP_NAME;
  const timeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS || 30000);

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(referer ? { "HTTP-Referer": referer } : {}),
        ...(title ? { "X-Title": title } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenRouter request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenRouter returned no content");
  }

  return content.trim();
}
