# Working Configuration Summary

## ✓ SUCCESSFUL SETUP (Use This)

### Models Configuration (.env.local)
```bash
# All agents use the same stable model
OPENROUTER_MODEL=arcee-ai/trinity-large-preview:free
OPENROUTER_MODEL_EDITOR=arcee-ai/trinity-large-preview:free
OPENROUTER_MODEL_DEFINER=arcee-ai/trinity-large-preview:free
OPENROUTER_MODEL_SKEPTIC=arcee-ai/trinity-large-preview:free
OPENROUTER_MODEL_COACH=arcee-ai/trinity-large-preview:free

# Token limits that work well
OPENROUTER_MAX_TOKENS=800
OPENROUTER_MAX_TOKENS_EDITOR=750
OPENROUTER_MAX_TOKENS_DEFINER=600
OPENROUTER_MAX_TOKENS_SKEPTIC=700
OPENROUTER_MAX_TOKENS_COACH=750

# Evaluation configuration
OPENROUTER_EVAL_MODEL=arcee-ai/trinity-large-preview:free
OPENROUTER_EVAL_MAX_TOKENS=2000

# Required for all setups
OPENROUTER_API_KEY=your_openrouter_api_key
MONGODB_URI=mongodb+srv://USER:PASSWORD@HOST/DATABASE?retryWrites=true&w=majority
MONGODB_DB=ai_private_blog
OPENROUTER_APP_URL=http://localhost:3000
OPENROUTER_APP_NAME=AI_Private_Blogging_Feedback
EVAL_MODE=true
```

### Results
- ✓ 5/5 articles processed successfully
- ✓ 20/20 agent outputs generated
- ✓ All agents maintained role boundaries
- ✓ 100/100 score on validated evaluation
- ✓ Zero cost (free tier)
- ✓ No network timeouts
- ✓ Stable and consistent outputs

---

## ✗ FAILED SETUP (Don't Use This)

### Models Configuration (Attempted)
```bash
# DeepSeek R1 attempted for agents
OPENROUTER_MODEL=deepseek/deepseek-r1-0528:free
OPENROUTER_MODEL_EDITOR=deepseek/deepseek-r1-0528:free
OPENROUTER_MODEL_SKEPTIC=deepseek/deepseek-r1-0528:free

# Required very high token limits
OPENROUTER_MAX_TOKENS=4000
OPENROUTER_MAX_TOKENS_EDITOR=4000
OPENROUTER_MAX_TOKENS_SKEPTIC=3500
OPENROUTER_EVAL_MAX_TOKENS=8000
```

### Issues Encountered
- ✗ Model returns empty `content` field (uses `reasoning` field instead)
- ✗ Network timeouts on longer prompts
- ✗ Requires 4000+ tokens for chain-of-thought reasoning
- ✗ Not suitable for structured output tasks
- ✗ finish_reason: "length" (hit token limit mid-response)

### Why It Failed
DeepSeek R1 is a **reasoning model** designed for chain-of-thought tasks, not a **completion model** designed for structured output. It generates internal reasoning tokens that don't appear in the final content field.

---

## Model Comparison

| Feature | arcee-ai/trinity-large-preview:free | deepseek/deepseek-r1-0528:free |
|---------|-----------------------------------|--------------------------------|
| **Output Structure** | Standard `content` field | Separate `reasoning` field |
| **Token Efficiency** | 600-800 tokens sufficient | Needs 4000+ tokens |
| **Stability** | Stable, no timeouts | Network timeouts |
| **Format Compliance** | Excellent | Poor (reasoning overflow) |
| **Best Use Case** | Structured tasks | Open-ended reasoning |
| **Recommendation** | ✓ Use for agents | ✗ Avoid for structured output |

---

## Running the Evaluation

### Command
```bash
cd apps/web
node scripts/eval-sample.mjs
```

### Expected Output
```
=== Article Title ===
Verdict: pass | Score: 100
```

### Output Files Location
```
apps/web/eval/blog-runs/[timestamp]/
├── inputs/          # Original articles
├── agent-outputs/   # 4-agent responses (JSON)
├── transcripts/     # Full formatted transcripts (TXT)
└── evals/          # Evaluation results (JSON)
```

---

## Alternative Configurations to Test

### Option 1: Mixed Models
```bash
OPENROUTER_MODEL_EDITOR=arcee-ai/trinity-large-preview:free
OPENROUTER_MODEL_DEFINER=arcee-ai/trinity-large-preview:free
OPENROUTER_MODEL_SKEPTIC=arcee-ai/trinity-large-preview:free
OPENROUTER_MODEL_COACH=arcee-ai/trinity-large-preview:free
OPENROUTER_EVAL_MODEL=google/gemini-2.5-flash  # Different eval model
```

### Option 2: Higher Quality (Paid)
```bash
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_EVAL_MODEL=openai/gpt-4-turbo
```

### Option 3: Other Free Models (Untested)
```bash
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
OPENROUTER_MODEL=google/gemma-3-27b-it:free
OPENROUTER_MODEL=openai/gpt-oss-120b:free
```

---

## Summary

**For immediate use:** Stick with `arcee-ai/trinity-large-preview:free` for all agents.

**For experimentation:** Try different models for evaluation to improve validation pass rate.

**Avoid:** DeepSeek R1 for structured output tasks.
