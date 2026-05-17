/**
 * Timezone utilities for TradeIQ chart display.
 *
 * Problem: Binance returns candle timestamps in UTC (Unix seconds).
 * Lightweight-charts interprets Unix timestamps as UTC and displays them as-is.
 * Users in non-UTC timezones (e.g., America/Bogota = UTC-5) see wrong times.
 *
 * Solution: Adjust timestamps from UTC to local time before passing to the chart.
 * The formula is: localTs = utcTs - timezoneOffsetMinutes * 60
 *
 * This adjustment happens ONLY in the chart display layer (trading-chart.tsx).
 * All internal data (hooks, API, WebSocket) remains in UTC for consistency.
 *
 * Why not use the Time API with Date strings?
 * - lightweight-charts' string-based Time format doesn't support intraday
 *   intervals well (1m, 5m, 15m, 1H) — it's designed for daily/weekly charts
 * - Unix timestamps + offset adjustment is the standard approach
 * - Works perfectly with the incremental update() method for real-time candles
 */

/**
 * Get the browser's current timezone offset in seconds.
 * Positive value means the timezone is behind UTC (e.g., UTC-5 returns 18000).
 *
 * Note: Date.getTimezoneOffset() returns the offset in MINUTES, and the sign
 * is inverted (UTC-5 returns +300). We negate it and convert to seconds.
 */
export function getTimezoneOffsetSeconds(): number {
  return -new Date().getTimezoneOffset() * 60;
}

/**
 * Get the timezone offset for a specific UTC timestamp.
 * This handles DST transitions correctly — the offset for a given timestamp
 * may differ from the current offset if DST has changed since then.
 *
 * @param utcTimestamp - Unix timestamp in seconds (UTC)
 * @returns Offset in seconds to add to UTC to get local time
 */
export function getTimezoneOffsetForTimestamp(utcTimestamp: number): number {
  // Create a Date from the UTC timestamp
  const date = new Date(utcTimestamp * 1000);
  // getTimezoneOffset() returns minutes, sign inverted
  return -date.getTimezoneOffset() * 60;
}

/**
 * Convert a UTC timestamp to local timestamp for chart display.
 *
 * @param utcTimestamp - Unix timestamp in seconds (UTC)
 * @returns Adjusted Unix timestamp that represents local time when displayed as UTC
 *
 * Example: UTC-5 (Bogota)
 *   Input:  1700000000 (2023-11-14 22:13 UTC)
 *   Output: 1700000000 - 18000 = 1699982000 (displayed as 2023-11-14 17:13)
 */
export function utcToLocal(utcTimestamp: number): number {
  return utcTimestamp + getTimezoneOffsetForTimestamp(utcTimestamp);
}

/**
 * Get a human-readable timezone label.
 * E.g., "UTC-5", "UTC+1", "UTC+5:30"
 */
export function getTimezoneLabel(): string {
  const offsetMinutes = new Date().getTimezoneOffset();
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absOffset / 60);
  const minutes = absOffset % 60;

  if (minutes === 0) {
    return `UTC${sign}${hours}`;
  }
  return `UTC${sign}${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Get the IANA timezone name from the browser.
 * E.g., "America/Bogota", "Europe/Madrid", "US/Eastern"
 */
export function getTimezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Get a short timezone display string for the chart.
 * E.g., "🇨🇴 UTC-5" or "UTC+0" or "UTC-5:30"
 */
export function getTimezoneDisplay(): string {
  const label = getTimezoneLabel();
  const name = getTimezoneName();

  // Map common IANA zones to flag emojis for a nicer display
  const flagMap: Record<string, string> = {
    'America/Bogota': '🇨🇴',
    'America/Mexico_City': '🇲🇽',
    'America/New_York': '🇺🇸',
    'America/Chicago': '🇺🇸',
    'America/Denver': '🇺🇸',
    'America/Los_Angeles': '🇺🇸',
    'America/Santiago': '🇨🇱',
    'America/Lima': '🇵🇪',
    'America/Buenos_Aires': '🇦🇷',
    'America/Sao_Paulo': '🇧🇷',
    'Europe/Madrid': '🇪🇸',
    'Europe/London': '🇬🇧',
    'Europe/Paris': '🇫🇷',
    'Europe/Berlin': '🇩🇪',
    'Asia/Tokyo': '🇯🇵',
    'Asia/Shanghai': '🇨🇳',
    'Asia/Kolkata': '🇮🇳',
    'Asia/Dubai': '🇦🇪',
    'Australia/Sydney': '🇦🇺',
  };

  const flag = flagMap[name] || '';
  return flag ? `${flag} ${label}` : label;
}
