# TradeIQ - GitHub Copilot Instructions
# Auto-loaded by GitHub Copilot in VS Code
# Version: 1.0.0

## Project: TradeIQ - Semi-automatic AI Trading Platform

### Tech Stack
- Next.js 16 + TypeScript
- Prisma + SQLite (dev), PostgreSQL (prod)
- shadcn/ui + Tailwind CSS
- lightweight-charts v5
- Zustand + TanStack Query

### Critical Rules
1. Always READ a file before modifying it
2. Use Edit/MultiEdit, never overwrite entire files
3. Update CHANGELOG.md for every change
4. Run `bun run lint` to verify
5. Never break exported interfaces without updating dependents
6. Business logic belongs in src/lib/, not in components
7. No `any` types without justification
8. No hardcoded API keys (use .env)
9. Present plan before coding changes

### Architecture
- src/lib/types.ts — shared types (CRITICAL, everyone depends on this)
- src/lib/confluence-engine.ts — core trading logic
- src/lib/technical-analysis.ts — RSI, MACD, Bollinger, EMA
- src/lib/pattern-detection.ts — candlestick patterns
- src/lib/volume-analysis.ts — OBV, A/D
- src/lib/market-data.ts — mock data provider
- src/app/api/ — 7 endpoints (candles, quote, analyze, signals, journal, watchlist, broker)
- src/components/trading/ — 7 UI components
- prisma/schema.prisma — 6 DB models

### Language
- Code/variables: English
- UI text/docs: Spanish

See WORKFLOW.md for full details.
