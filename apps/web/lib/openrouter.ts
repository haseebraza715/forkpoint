type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenRouterRequest = {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
};

type OpenRouterResponse = {
  choices?: { message?: { content?: string } }[];
};

export async function callOpenRouter(payload: OpenRouterRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const referer = process.env.OPENROUTER_APP_URL;
  const title = process.env.OPENROUTER_APP_NAME;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(referer ? { "HTTP-Referer": referer } : {}),
      ...(title ? { "X-Title": title } : {})
    },
    body: JSON.stringify(payload)
  });

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
