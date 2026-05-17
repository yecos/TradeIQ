import type { Candle, Quote } from '../types';

/**
 * Market Data Validator — validates all incoming data from external APIs.
 *
 * Prevents bad data from reaching the analysis engine and trading logic.
 * Key validations:
 * 1. Price sanity checks (no zero, negative, or absurdly large values)
 * 2. NaN/Infinity guards
 * 3. Volume validation
 * 4. Candle consistency (OHLC relationships)
 * 5. Gap detection (missing candles in a series)
 * 6. Staleness detection (data too old)
 */

export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export interface DataQualityReport {
  source: 'real' | 'mock' | 'stale' | 'partial';
  isMockData: boolean;
  isStale: boolean;
  staleSymbols: string[];
  lastRealDataTime: number | null;
  warnings: string[];
}

/**
 * Validate a single candle's OHLCV data.
 */
export function validateCandle(candle: Candle, symbol?: string): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const prefix = symbol ? `[${symbol}]` : '';

  // NaN / Infinity checks
  const fields: (keyof Candle)[] = ['open', 'high', 'low', 'close', 'volume'];
  for (const field of fields) {
    const val = candle[field];
    if (typeof val !== 'number' || isNaN(val)) {
      errors.push(`${prefix} Candle ${field} is NaN (time=${candle.time})`);
    } else if (!isFinite(val)) {
      errors.push(`${prefix} Candle ${field} is Infinity (time=${candle.time})`);
    }
  }

  // Price sanity checks
  if (candle.close <= 0) {
    errors.push(`${prefix} Candle close price is zero or negative: ${candle.close}`);
  }
  if (candle.open <= 0) {
    warnings.push(`${prefix} Candle open price is zero or negative: ${candle.open}`);
  }
  if (candle.high <= 0 || candle.low <= 0) {
    errors.push(`${prefix} Candle high/low is zero or negative: H=${candle.high} L=${candle.low}`);
  }

  // OHLC consistency: High >= max(Open, Close), Low <= min(Open, Close)
  if (isFinite(candle.high) && isFinite(candle.open) && isFinite(candle.close)) {
    const maxOC = Math.max(candle.open, candle.close);
    if (candle.high < maxOC * 0.99) { // 1% tolerance for floating point
      warnings.push(`${prefix} Candle high (${candle.high}) < max(open, close) (${maxOC.toFixed(2)})`);
    }
  }
  if (isFinite(candle.low) && isFinite(candle.open) && isFinite(candle.close)) {
    const minOC = Math.min(candle.open, candle.close);
    if (candle.low > minOC * 1.01) { // 1% tolerance
      warnings.push(`${prefix} Candle low (${candle.low}) > min(open, close) (${minOC.toFixed(2)})`);
    }
  }

  // Volume check
  if (candle.volume < 0) {
    errors.push(`${prefix} Candle volume is negative: ${candle.volume}`);
  }

  // Timestamp check
  if (candle.time <= 0) {
    errors.push(`${prefix} Candle timestamp is invalid: ${candle.time}`);
  }
  const now = Math.floor(Date.now() / 1000);
  if (candle.time > now + 86400) { // More than 1 day in the future
    warnings.push(`${prefix} Candle timestamp is in the future: ${new Date(candle.time * 1000).toISOString()}`);
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Validate an array of candles — checks individual candles plus series-level issues.
 */
export function validateCandleArray(candles: Candle[], symbol?: string): ValidationResult {
  const allWarnings: string[] = [];
  const allErrors: string[] = [];

  if (candles.length === 0) {
    return { isValid: false, warnings: [], errors: ['No candles provided'] };
  }

  // Validate each candle
  let errorCount = 0;
  for (let i = 0; i < candles.length; i++) {
    const result = validateCandle(candles[i], symbol);
    allWarnings.push(...result.warnings);
    allErrors.push(...result.errors);
    if (!result.isValid) errorCount++;
  }

  // Gap detection — check for missing days in the series
  if (candles.length > 2) {
    const daySeconds = 86400;
    let gaps = 0;
    for (let i = 1; i < candles.length; i++) {
      const diff = candles[i].time - candles[i - 1].time;
      // For daily candles, gap > 3 days is suspicious (weekends are ~2 days for stocks)
      if (diff > daySeconds * 3) {
        gaps++;
      }
    }
    if (gaps > 5) {
      allWarnings.push(`Series has ${gaps} gaps > 3 days — data may be incomplete`);
    }
  }

  // Sort order check
  let sortErrors = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time <= candles[i - 1].time) {
      sortErrors++;
    }
  }
  if (sortErrors > 0) {
    allWarnings.push(`Series has ${sortErrors} out-of-order candles`);
  }

  // If more than 10% of candles have errors, mark as invalid
  if (errorCount > candles.length * 0.1) {
    allErrors.push(`Too many invalid candles: ${errorCount}/${candles.length}`);
  }

  return {
    isValid: allErrors.length === 0,
    warnings: allWarnings,
    errors: allErrors,
  };
}

/**
 * Validate a quote object.
 */
export function validateQuote(quote: Quote): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const prefix = `[${quote.symbol}]`;

  // NaN / Infinity
  if (typeof quote.price !== 'number' || isNaN(quote.price) || !isFinite(quote.price)) {
    errors.push(`${prefix} Price is invalid: ${quote.price}`);
  }

  // Price sanity
  if (quote.price <= 0) {
    errors.push(`${prefix} Price is zero or negative: ${quote.price}`);
  }

  // Change consistency
  if (quote.price > 0 && quote.prevClose > 0) {
    const expectedChange = quote.price - quote.prevClose;
    const diff = Math.abs(expectedChange - quote.change);
    if (diff > Math.abs(quote.change) * 0.1 + 0.01) { // 10% tolerance + 1 cent
      warnings.push(`${prefix} Change inconsistency: price=${quote.price}, prevClose=${quote.prevClose}, stated change=${quote.change}, expected=${expectedChange.toFixed(2)}`);
    }
  }

  // Volume
  if (quote.volume < 0) {
    errors.push(`${prefix} Volume is negative: ${quote.volume}`);
  }

  // High/Low bounds
  if (quote.high > 0 && quote.low > 0) {
    if (quote.price > quote.high * 1.01) {
      warnings.push(`${prefix} Price ${quote.price} > high ${quote.high}`);
    }
    if (quote.price < quote.low * 0.99) {
      warnings.push(`${prefix} Price ${quote.price} < low ${quote.low}`);
    }
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Price sanity check — detect obviously wrong prices.
 * Uses known price ranges for common symbols and general rules.
 */
export function isPriceSane(symbol: string, price: number): boolean {
  if (price <= 0 || !isFinite(price) || isNaN(price)) return false;

  // Known symbol price ranges (approximate, wide bounds)
  const sanityRanges: Record<string, { min: number; max: number }> = {
    'BTC': { min: 1000, max: 500000 },
    'ETH': { min: 50, max: 50000 },
    'BNB': { min: 5, max: 5000 },
    'SOL': { min: 1, max: 1000 },
    'XRP': { min: 0.01, max: 10 },
    'ADA': { min: 0.01, max: 10 },
    'DOGE': { min: 0.001, max: 5 },
    'AAPL': { min: 50, max: 500 },
    'NVDA': { min: 50, max: 2000 },
    'MSFT': { min: 100, max: 1000 },
    'TSLA': { min: 50, max: 1000 },
    'SPY': { min: 100, max: 1000 },
    'QQQ': { min: 50, max: 1000 },
  };

  const range = sanityRanges[symbol.toUpperCase()];
  if (range) {
    return price >= range.min && price <= range.max;
  }

  // Generic sanity: price should be between $0.0001 and $10,000,000
  return price >= 0.0001 && price <= 10_000_000;
}

/**
 * Check if candle data is stale (last candle too old).
 */
export function isCandleDataStale(candles: Candle[], interval: string = '1D'): boolean {
  if (candles.length === 0) return true;
  const lastCandle = candles[candles.length - 1];
  const ageSeconds = Math.floor(Date.now() / 1000) - lastCandle.time;

  // For daily/weekly: stale if last candle > 48 hours old
  // For intraday: stale if last candle > 2 hours old
  const maxAgeSeconds = ['1D', '1W'].includes(interval) ? 48 * 3600 : 2 * 3600;
  return ageSeconds > maxAgeSeconds;
}

/**
 * Clean and repair candle data — removes invalid candles and logs issues.
 * Returns a cleaned array (may be shorter than input).
 */
export function cleanCandleData(candles: Candle[], symbol?: string): Candle[] {
  const cleaned: Candle[] = [];
  let removed = 0;

  for (const candle of candles) {
    const result = validateCandle(candle, symbol);
    if (result.isValid) {
      cleaned.push(candle);
    } else {
      removed++;
      if (removed <= 3) {
        console.warn(`[TradeIQ] Removed invalid candle: ${result.errors.join(', ')}`);
      }
    }
  }

  if (removed > 3) {
    console.warn(`[TradeIQ] ... and ${removed - 3} more invalid candles removed (total: ${removed})`);
  }

  // Re-sort by time
  cleaned.sort((a, b) => a.time - b.time);

  return cleaned;
}
