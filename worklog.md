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
