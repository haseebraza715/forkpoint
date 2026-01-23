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
const promptsPath = path.join(baseDir, "lib", "prompts.ts");
const evalPromptPath = path.join(baseDir, "eval", "eval-prompt.txt");

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL;
const evalModel = process.env.OPENROUTER_EVAL_MODEL || model;

if (!apiKey) {
  throw new Error("OPENROUTER_API_KEY is not set");
}
if (!model) {
  throw new Error("OPENROUTER_MODEL is not set");
}

const articles = [
  {
    title: "Stuck on the launch",
    body: `I keep rewriting my launch plan because I'm worried the first version will prove I'm not ready. I tell myself I'm improving the strategy, but it might be avoidance.

Last week I rewrote the pricing page three times. My cofounder asked if we could just ship it and I said "one more pass." She didn't push back but I could tell she was frustrated.

The weird part is I know the current version is fine. I even showed it to two potential customers and they understood it immediately. But I keep finding things to tweak.`
  },
  {
    title: "Too many ideas",
    body: `I bounce between three ideas and never commit. Each one feels exciting for a day and then I look for a better one.

Idea 1: A newsletter about hiring. I have 10 drafts sitting in Notion.

Idea 2: A tool for interview scheduling. I bought the domain six months ago.

Idea 3: Coaching for first-time managers. I made a landing page last week.

None of them are launched. When I sit down to work on one, I think about the others. When someone asks what I'm building, I give a different answer each time.`
  },
  {
    title: "Quiet resentment",
    body: `I say yes to work I don't want to do and then feel resentful. I keep hoping people will notice and adjust without me asking.

My manager asked me to lead the integration project. I said yes even though I hate this kind of work. It's not what I was hired for. But she seemed stressed and I didn't want to add to her problems.

Now I'm three weeks in and I dread every meeting. I've started showing up late and giving short answers. Part of me wants her to notice something is wrong so I don't have to say it directly.`
  },
  {
    title: "Fear of publishing",
    body: `I want to publish writing but I'm stuck on making it perfect. If it's not good, I think it will damage how people see me.

I have 23 drafts in my folder. Some of them are 90% done. I keep opening them, changing a few sentences, and closing them again. I've been doing this for eight months.

Last month a friend published a post that I thought was mediocre. It got a lot of engagement. I felt jealous and also confused — why can he ship something imperfect and I can't?`
  },
  {
    title: "Delayed decisions",
    body: `I delay decisions until the last moment because I want more data. The delay often makes the decision worse, but I still repeat it.

Last week I had to choose between two candidates for a role. I had enough information by Tuesday. I waited until Friday, asked for one more reference call, and then the stronger candidate accepted another offer.

My team has started making decisions without me. I think they're tired of waiting. I should feel relieved but instead I feel bypassed.`
  },
  {
    title: "The promotion I don't want",
    body: `I got offered a promotion to engineering manager. Everyone is congratulating me. I haven't told anyone I don't want it.

I like writing code. I like solving hard problems alone. The idea of spending my days in 1:1s and dealing with performance reviews makes me feel hollow.

But saying no feels like career suicide. And my parents would be confused — why would you turn down more money and a better title? I don't have a good answer.`
  },
  {
    title: "I might be the problem",
    body: `Third startup, third cofounder conflict. I'm starting to think the common factor is me.

Each time it's the same pattern: we start aligned, things get tense around month six, and by month twelve we're barely speaking. I always have a story about why they were difficult. But three times?

I don't know what I'm doing wrong. I've asked and they give vague answers like "communication issues." I want to fix it but I can't fix what I can't see.`
  }
];

function extractTemplate(file, key) {
  const pattern = new RegExp(`${key}\\s*:\\s*\`([\\s\\S]*?)\``, "m");
  const match = file.match(pattern);
  if (!match) {
    throw new Error(`Could not find prompt for ${key}`);
  }
  return match[1].trim();
}

function extractSharedRules(file) {
  const pattern = /export const SHARED_RULES\s*=\s*"([\s\S]*?)";/m;
  const match = file.match(pattern);
  if (!match) {
    throw new Error("Could not find SHARED_RULES");
  }
  return match[1].replace(/\\n/g, "\n");
}

async function callOpenRouter(systemPrompt, userText, modelToUse, maxTokens) {
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
      model: modelToUse,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText }
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

  return content.trim();
}

function validateEval(result, transcript) {
  const rawViolations = Array.isArray(result.violations) ? result.violations : [];
  result.violations = sanitizeViolations(rawViolations);
  result.overallScore = normalizeScore(result.violations);
  return validateEvalResult(result, transcript);
}

async function run() {
  const [promptFile, evalPrompt] = await Promise.all([
    readFile(promptsPath, "utf8"),
    readFile(evalPromptPath, "utf8")
  ]);

  const sharedRules = extractSharedRules(promptFile);
  const promptKeys = ["editor", "definer", "skeptic", "coach"];
  const prompts = Object.fromEntries(
    promptKeys.map((key) => [key, extractTemplate(promptFile, key)])
  );

  for (const entry of articles) {
    const userText = entry.title ? `Title: ${entry.title}\n\n${entry.body}` : entry.body;
    const outputs = {};

    for (const key of promptKeys) {
      const systemPrompt = `${sharedRules}\n\n${prompts[key]}`;
      outputs[key] = await callOpenRouter(systemPrompt, userText, model, 900);
    }

    const transcript = buildTranscriptFromMap(entry, outputs);
    const evalContent = await callOpenRouter(
      evalPrompt,
      `TRANSCRIPT TO EVALUATE:\n${transcript}\n\nCURRENT PROMPT VERSION:\nlocal`,
      evalModel,
      3000
    );

    let evalResult;
    try {
      evalResult = tryParseJSON(evalContent);
    } catch (error) {
      console.error(`\n=== ${entry.title} ===`);
      console.error("Eval JSON parse failed. Response preview:");
      console.error(evalContent.slice(0, 500));
      console.error(`\nParse error: ${error.message}`);
      const jsonStart = evalContent.indexOf("{");
      if (jsonStart >= 0) {
        const preview = evalContent.slice(jsonStart, Math.min(jsonStart + 500, evalContent.length));
        console.error(`\nJSON preview: ${preview}...`);
      }
      continue;
    }

    // Override model field with actual model used
    evalResult.model = evalModel;
    evalResult.violations = sanitizeViolations(evalResult.violations);
    evalResult.overallScore = normalizeScore(evalResult.violations);

    const validation = validateEval(evalResult, transcript);
    if (!validation.ok) {
      const retryContent = await callOpenRouter(
        evalPrompt,
        `TRANSCRIPT TO EVALUATE:\n${transcript}\n\nCURRENT PROMPT VERSION:\nlocal\n\nVALIDATION_ERRORS:\n${validation.errors.join("; ")}`,
        evalModel,
        3000
      );
      try {
        evalResult = tryParseJSON(retryContent);
      } catch (error) {
        console.error(`\n=== ${entry.title} ===`);
        console.error("Retry eval JSON parse failed. Response preview:");
        console.error(retryContent.slice(0, 500));
        console.error(`\nParse error: ${error.message}`);
        const jsonStart = retryContent.indexOf("{");
        if (jsonStart >= 0) {
          const preview = retryContent.slice(jsonStart, Math.min(jsonStart + 500, retryContent.length));
          console.error(`\nJSON preview: ${preview}...`);
        }
        continue;
      }
      evalResult.model = evalModel;
      evalResult.violations = sanitizeViolations(evalResult.violations);
      evalResult.overallScore = normalizeScore(evalResult.violations);

      // Re-validate after retry
      const retryValidation = validateEval(evalResult, transcript);
      if (!retryValidation.ok) {
        console.error(`\n=== ${entry.title} ===`);
        console.error("Retry validation still failed:", retryValidation.errors.join(", "));
        continue;
      }
    }

    console.log(`\n=== ${entry.title} ===`);
    console.log(`Verdict: ${evalResult.verdict} | Score: ${evalResult.overallScore}`);
    if (Array.isArray(evalResult.violations) && evalResult.violations.length > 0) {
      console.log(`Violations: ${evalResult.violations.join(", ")}`);
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
