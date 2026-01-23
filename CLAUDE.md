# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Private Blogging Feedback - a private writing workspace that provides multi-agent reflection on written entries. Four independent AI agents (Editor, Definer, Skeptic, Coach) analyze text to improve reasoning and clarity. The system prioritizes "clarity over comfort" and is designed to pressure-test thinking, not boost mood.

## Development Commands

All commands run from `apps/web/`:

```bash
npm run dev              # Start Next.js dev server (http://localhost:3000)
npm run build            # Production build
npm run lint             # ESLint
npm run eval:calibrate   # Calibrate evaluation metrics
npm run eval:pr          # CI gate: 5 random entries, fails on fail/flag
npm run eval:gate        # Full gate: calibrate + 10 recent entries
```

## Architecture

```
apps/web/
├── app/
│   ├── page.tsx                    # Main UI (client component)
│   ├── admin/                      # Eval dashboard
│   └── api/
│       ├── entries/                # CRUD + reflect endpoints
│       └── eval/                   # Evaluation endpoints
├── lib/
│   ├── prompts.ts                  # Agent system prompts (versioned)
│   ├── eval.ts                     # Evaluation framework
│   ├── mongodb.ts                  # DB connection pooling
│   └── openrouter.ts               # LLM API client
├── eval/
│   ├── eval-prompt.txt             # Evaluator rules and violation IDs
│   └── golden/                     # Test golden cases
├── scripts/                        # CLI evaluation runners (Node.js)
└── reflections/                    # JSON snapshots per entry
```

## Core Concepts

### Four-Agent System
- **Editor**: Clarity and structure (SUMMARY, FIXES, REWRITE)
- **Definer**: Operational definitions (KEY TERMS, AMBIGUITIES, BOUNDARIES)
- **Skeptic**: Stress-testing logic (CORE CLAIM, CHALLENGES, TEST)
- **Coach**: Direction and trade-offs (INTENT, OPTIONS, RECOMMENDATION, STOP)

Each agent has strict constraints in `lib/prompts.ts`. Agents must not drift into other roles (e.g., Editor diagnosing causes, Coach inventing identity labels).

### Evaluation Framework
Located in `lib/eval.ts` and `eval/eval-prompt.txt`. Key concepts:
- **Verdicts**: pass / fail / flag
- **Violation IDs**: Whitelist of 10 allowed violations (e.g., `editor_causal_inference`, `skeptic_over_explains`)
- **Dimensions**: Role purity, format discipline, pressure calibration, actionability, redundancy
- Validation retries with temperature 0.2 → 0 on failure

### Streaming
Reflection uses NDJSON streaming (`/api/entries/[id]/reflect/stream`). Messages have types: `start`, `chunk`, `done`, `error`.

## Key Conventions

- **Prompt versioning**: `PROMPT_VERSION` in `lib/prompts.ts` tracks prompt changes
- **SHARED_RULES**: Applied to all agents - formatting requirements, no praise, no assumptions
- **Formatting**: Plain text only, `- ` bullets, no markdown except section headings
- **Snapshots**: Each reflection writes JSON to `reflections/<entryId>.json`
- **Entry status**: `draft` → `reflected` after reflection completes

## Environment Variables

Required in `apps/web/.env.local`:
- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DB` - Database name (default: `ai_private_blog`)
- `OPENROUTER_API_KEY` - OpenRouter API key
- `OPENROUTER_MODEL` - Model ID (e.g., `xiaomi/mimo-v2-flash:free`)

## Data Model

**entries**: `{ _id, title?, body, createdAt, updatedAt, status, wordCount }`

**feedback**: `{ _id, entryId, agent, content, createdAt, model, promptVersion }`
