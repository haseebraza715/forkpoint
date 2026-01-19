# AI Private Blogging Feedback

A private reflection workspace where you write honestly and receive feedback from three AI agents: Editor, Skeptic, and Coach.

## Features

- **Editor**: Improves clarity and structure without changing meaning
- **Skeptic**: Stress-tests your thinking with pointed challenges
- **Coach**: Helps you choose direction by making trade-offs explicit

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- MongoDB
- OpenRouter API

## Getting Started

1. Install dependencies:
```bash
cd apps/web
npm install
```

2. Set up environment variables in `apps/web/.env`:
```
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB=ai_private_blog
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=xiaomi/mimo-v2-flash:free
OPENROUTER_APP_URL=http://localhost:3000
OPENROUTER_APP_NAME=AI_Private_Blogging_Feedback
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
apps/web/
├── app/              # Next.js app directory
│   ├── api/          # API routes
│   └── page.tsx      # Main page
├── lib/              # Core libraries
│   ├── mongodb.ts    # Database connection
│   ├── openrouter.ts # AI API client
│   └── prompts.ts    # Agent prompts
└── reflections/      # Reflection snapshots
```

## License

MIT
