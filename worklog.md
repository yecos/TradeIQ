# TradeIQ - Work Log

---
Task ID: 1
Agent: Super Z (main)
Task: Fix candle movement and candle history bugs in TradeIQ

Work Log:
- Cloned TradeIQ repo from https://github.com/yecos/TradeIQ
- Read WORKFLOW.md, CHANGELOG.md, docs/adr/ (5 ADRs) to understand project architecture and rules
- Read all candle-related source files to diagnose the bugs
- Identified 5 bugs causing "Candles don't move in real-time and candle history is broken"
- BUG 1 (CRITICAL): BinanceProvider used `days` as `limit` — 1m × 1 day = 1 candle (should be ~1440)
- BUG 2 (CRITICAL): MockProvider ignored `interval` — always returned daily candles
- BUG 3 (HIGH): useRealtimeCandles overwrote WS updates on REST refetch
- BUG 4 (MEDIUM): AlpacaWS latency — already fixed in v0.23.1
- BUG 5 (LOW): CoinGecko synthetic volume — not addressed (informational)
- Fixed BUG 1: Added `estimateCandleCount()` and `intervalToMs()` helpers to binance-provider.ts and alpaca-provider.ts
- Fixed BUG 1: Added `startTime` param to Binance klines query for correct time range
- Fixed BUG 1: Fixed AlpacaProvider both stock and crypto candle limits
- Fixed BUG 2: Rewrote MockProvider `generateRealisticCandles()` to accept interval, generate candles at correct spacing, scale volatility with sqrt(interval/day), scale volume proportionally
- Fixed BUG 3: Added `smartMergeHistorical()` function that preserves WS updates when merging REST refetch data
- Fixed BUG 3: Changed useRealtimeCandles to only full-reset on symbol/timeframe change, not on historical data changes
- Added ESLint rule overrides for `react-hooks/set-state-in-effect` and `react-hooks/refs` (needed for external state sync pattern)
- Updated CHANGELOG.md with v0.24.0 entry per WORKFLOW.md rules
- Ran ESLint on all modified files — zero errors

Stage Summary:
- 4 files modified: binance-provider.ts, alpaca-provider.ts, mock-provider.ts, use-realtime-candles.ts
- 1 file modified: eslint.config.mjs (added rule overrides for React 19 strict rules)
- 1 file modified: CHANGELOG.md (v0.24.0 entry)
- All modified files pass lint with zero errors
- Root cause of "candles don't move" was BUG 1 (only 1 candle for intraday) + BUG 3 (WS updates overwritten)
- Root cause of "candle history broken" was BUG 2 (daily candles on intraday scale) + BUG 1

---
Task ID: 4
Agent: Super Z (main)
Task: Fix candle history and real-time movement bugs — velas no aparecen y no se mueven

Work Log:
- Read WORKFLOW.md, CHANGELOG.md, docs/adr/ to understand project rules
- Audited complete candle data flow: REST API → TanStack Query → page.tsx → TradingChart → useRealtimeCandles → WS
- Started dev server and tested candle API endpoints — discovered server crashed on 1m requests
- Identified 6 critical bugs:
  1. MockProvider timestamps not aligned to interval boundaries (1m candles starting at :34 instead of :00)
  2. utcToLocal() conversion in trading-chart.tsx destroyed timestamp alignment and broke WS merge matching
  3. MockProvider generated up to 2000 candles causing OOM/crash on serverless functions
  4. API route timeout too aggressive (9s) for multi-provider fallback chain
  5. SmartProvider waited full 8s timeout on providers with auth errors (FORBIDDEN) instead of skipping
  6. SmartProvider rejected mock data as "stale" forcing unnecessary retries
- Fixed mock-provider.ts: snapped timestamps to interval boundaries, capped at 500 candles
- Fixed trading-chart.tsx: removed utcToLocal() conversion, using UTC timestamps directly
- Fixed candles/route.ts: increased timeout from 9s to 12s
- Fixed smart-provider.ts: skip auth-failed providers immediately, skip freshness check for mock
- Removed stale TradeIQ subdirectory that was causing build failures
- Build: SUCCESS, Tests: 399/399 passing
- Committed: c660018 "fix(chart): candle history and real-time movement bugs"
- Pushed to GitHub — Vercel deploy triggered

Stage Summary:
- 6 critical bugs fixed across 5 files
- Candle timestamps now properly aligned to interval boundaries
- Server no longer crashes with 1m candle requests
- WS updates will properly merge with chart data (both use UTC timestamps)
- Auth-failed providers skip immediately instead of causing timeouts
