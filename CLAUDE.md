# TradeIQ - AI Development Rules
# This file is automatically read by Claude Code
# Version: 1.0.0 | 2026-05-17

## Project Context

TradeIQ is a semi-automatic AI trading platform built with Next.js 16 + TypeScript.
It analyzes financial markets using multiple vectors (technical indicators, candlestick
patterns, volume, news, sentiment, macro) and generates trade signals with entry, SL, TP.

Stack: Next.js 16, Prisma + SQLite, TypeScript, shadcn/ui, Tailwind CSS, lightweight-charts v5, Zustand, TanStack Query

Repo: https://github.com/yecos/TradeIQ

## Mandatory Rules

1. **READ BEFORE WRITE**: Always read a file before modifying it. Use Read tool.
2. **EDIT, DON'T OVERWRITE**: Use Edit/MultiEdit for existing files. Write is only for new files.
3. **DOCUMENT CHANGES**: Update CHANGELOG.md after every functional change.
4. **VERIFY**: Run `bun run lint` after changes. Fix errors immediately.
5. **NO BREAKING INTERFACES**: Changing exported types/functions requires updating ALL dependents.
6. **PLAN FIRST**: Present your plan. Wait for approval before coding.
7. **WORKLOG**: Update worklog.md at session end.
8. **NO SECRETS**: Never hardcode API keys. Use .env variables.
9. **SEPARATION OF CONCERNS**: Business logic in lib/, UI in components, data via providers.
10. **STRICT TYPESCRIPT**: No `any` without justification.

## Critical Files (modify with extreme care)

- `src/lib/types.ts` — ALL files depend on this
- `src/lib/confluence-engine.ts` — core business logic
- `src/lib/market-data.ts` — data provider (API routes depend on it)
- `prisma/schema.prisma` — all API routes depend on it

## Session Flow

1. Read WORKFLOW.md, CHANGELOG.md, and relevant source files
2. Present plan → WAIT for approval
3. Execute with Edit/MultiEdit (surgical changes)
4. Verify with `bun run lint`
5. Update CHANGELOG.md
6. Update worklog.md

## Full Details

Read WORKFLOW.md in the repo root for complete rules, architecture, ADRs, and roadmap.
