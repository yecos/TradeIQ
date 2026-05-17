/**
 * FRED (Federal Reserve Economic Data) Provider — FREE macro/economic data.
 *
 * Why FRED?
 * - 100% FREE — 840,000+ data series, no paid tier
 * - 120 API calls/minute — generous for macro data (updates daily/weekly, not per-second)
 * - Covers: GDP, CPI, Fed Funds Rate, unemployment, consumer sentiment, etc.
 * - Official US government data source
 * - API key is free — just register at https://fred.stlouisfed.org/docs/api/api_key.html
 *
 * Use cases in TradeIQ:
 * - Macro analysis vector (fed rate trend, economic events)
 * - Economic calendar (key data releases)
 * - Dashboard widgets (interest rates, inflation, GDP growth)
 *
 * FRED API docs: https://fred.stlouisfed.org/docs/api/fred/
 */

export interface FREDDataPoint {
  date: string;     // YYYY-MM-DD
  value: number;
}

export interface FREDIndicator {
  seriesId: string;
  title: string;
  value: number;
  previousValue: number;
  change: number;
  changePercent: number;
  unit: string;
  frequency: string;
  lastUpdated: string;
}

export interface FREDEconomicEvent {
  seriesId: string;
  title: string;
  releaseDate: string;
  value: string | null;
  previousValue: string | null;
  importance: 'high' | 'medium' | 'low';
}

// Key FRED series IDs for trading/macro analysis
export const FRED_SERIES: Record<string, { id: string; title: string; unit: string; frequency: string; importance: 'high' | 'medium' | 'low' }> = {
  // Interest Rates
  FED_RATE: { id: 'FEDFUNDS', title: 'Federal Funds Rate', unit: '%', frequency: 'Monthly', importance: 'high' },
  TREASURY_10Y: { id: 'DGS10', title: '10-Year Treasury', unit: '%', frequency: 'Daily', importance: 'high' },
  TREASURY_2Y: { id: 'DGS2', title: '2-Year Treasury', unit: '%', frequency: 'Daily', importance: 'high' },
  TREASURY_3M: { id: 'DTB3', title: '3-Month Treasury', unit: '%', frequency: 'Daily', importance: 'medium' },

  // Inflation
  CPI: { id: 'CPIAUCSL', title: 'Consumer Price Index', unit: 'Index', frequency: 'Monthly', importance: 'high' },
  CPI_YOY: { id: 'CPIAUCSL', title: 'CPI Year-over-Year', unit: '%', frequency: 'Monthly', importance: 'high' },
  CORE_CPI: { id: 'CPILFESL', title: 'Core CPI (ex Food & Energy)', unit: 'Index', frequency: 'Monthly', importance: 'high' },
  PCE: { id: 'PCEPI', title: 'PCE Price Index', unit: 'Index', frequency: 'Monthly', importance: 'medium' },

  // Employment
  UNEMPLOYMENT: { id: 'UNRATE', title: 'Unemployment Rate', unit: '%', frequency: 'Monthly', importance: 'high' },
  NONFARM_PAYROLLS: { id: 'PAYEMS', title: 'Nonfarm Payrolls', unit: 'Thousands', frequency: 'Monthly', importance: 'high' },
  INITIAL_CLAIMS: { id: 'ICSA', title: 'Initial Jobless Claims', unit: 'Number', frequency: 'Weekly', importance: 'medium' },

  // GDP & Growth
  GDP: { id: 'GDP', title: 'Gross Domestic Product', unit: 'Billions $', frequency: 'Quarterly', importance: 'high' },
  GDP_GROWTH: { id: 'A191RL1Q225SBEA', title: 'Real GDP Growth Rate', unit: '%', frequency: 'Quarterly', importance: 'high' },

  // Sentiment
  CONSUMER_SENTIMENT: { id: 'UMCSENT', title: 'Consumer Sentiment', unit: 'Index', frequency: 'Monthly', importance: 'medium' },

  // Money Supply
  M2: { id: 'WM2NS', title: 'M2 Money Supply', unit: 'Billions $', frequency: 'Weekly', importance: 'medium' },

  // Volatility
  VIX: { id: 'VIXCLS', title: 'CBOE Volatility Index (VIX)', unit: 'Index', frequency: 'Daily', importance: 'high' },
};

// Cache TTL for different frequencies
const CACHE_TTL: Record<string, number> = {
  'Daily': 30 * 60 * 1000,      // 30 min
  'Weekly': 4 * 3600 * 1000,    // 4 hours
  'Monthly': 24 * 3600 * 1000,  // 24 hours
  'Quarterly': 48 * 3600 * 1000, // 48 hours
};

export class FREDProvider {
  private apiKey: string;
  private baseUrl = 'https://api.stlouisfed.org/fred';
  private cache = new Map<string, { data: unknown; timestamp: number; ttl: number }>();

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('FRED API key is required');
    this.apiKey = apiKey;
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: unknown, ttlMs: number): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${this.apiKey}&file_type=json`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('FRED_RATE_LIMIT: Rate limit exceeded (120/min)');
      }
      throw new Error(`FRED API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get the latest value for a FRED series.
   */
  async getLatestValue(seriesId: string): Promise<FREDIndicator | null> {
    const cacheKey = `fred:latest:${seriesId}`;
    const cached = this.getCached<FREDIndicator>(cacheKey);
    if (cached) return cached;

    try {
      // Get series info
      const seriesInfo = await this.fetch<{
        id: string;
        title: string;
        units: string;
        frequency: string;
        last_updated: string;
      }>(`/series?series_id=${seriesId}`);

      // Get latest observations
      const observations = await this.fetch<{
        observations: { date: string; value: string }[];
      }>(`/series/observations?series_id=${seriesId}&sort_order=desc&limit=2`);

      if (!observations.observations || observations.observations.length === 0) {
        return null;
      }

      const latest = observations.observations[0];
      const previous = observations.observations[1];

      const value = parseFloat(latest.value);
      const previousValue = previous ? parseFloat(previous.value) : value;

      if (isNaN(value)) return null;

      const result: FREDIndicator = {
        seriesId,
        title: seriesInfo.title || seriesId,
        value,
        previousValue,
        change: value - previousValue,
        changePercent: previousValue !== 0 ? ((value - previousValue) / Math.abs(previousValue)) * 100 : 0,
        unit: seriesInfo.units || '',
        frequency: seriesInfo.frequency || '',
        lastUpdated: seriesInfo.last_updated || latest.date,
      };

      const ttl = CACHE_TTL[seriesInfo.frequency] || 24 * 3600 * 1000;
      this.setCache(cacheKey, result, ttl);

      return result;
    } catch (error) {
      console.warn(`[TradeIQ] FRED fetch failed for ${seriesId}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * Get key macro indicators for the dashboard.
   */
  async getKeyIndicators(): Promise<FREDIndicator[]> {
    const keySeries = ['FEDFUNDS', 'DGS10', 'DGS2', 'CPIAUCSL', 'UNRATE', 'VIXCLS', 'GDP', 'UMCSENT'];

    const results = await Promise.allSettled(
      keySeries.map(id => this.getLatestValue(id))
    );

    return results
      .map((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          return r.value;
        }
        return null;
      })
      .filter((r): r is FREDIndicator => r !== null);
  }

  /**
   * Get yield curve data (2Y vs 10Y spread — recession indicator).
   */
  async getYieldCurveSpread(): Promise<{ spread: number; is2yAbove10y: boolean } | null> {
    try {
      const [treasury10y, treasury2y] = await Promise.all([
        this.getLatestValue('DGS10'),
        this.getLatestValue('DGS2'),
      ]);

      if (!treasury10y || !treasury2y) return null;

      const spread = treasury10y.value - treasury2y.value;
      return {
        spread: Math.round(spread * 100) / 100,
        is2yAbove10y: treasury2y.value > treasury10y.value, // Inverted yield curve
      };
    } catch {
      return null;
    }
  }

  /**
   * Get economic calendar (upcoming releases for key series).
   */
  async getEconomicCalendar(): Promise<FREDEconomicEvent[]> {
    // FRED doesn't have a calendar endpoint, but we can check
    // the release dates for key series
    const calendarSeries = [
      { id: 'FEDFUNDS', importance: 'high' as const },
      { id: 'CPIAUCSL', importance: 'high' as const },
      { id: 'UNRATE', importance: 'high' as const },
      { id: 'PAYEMS', importance: 'high' as const },
      { id: 'GDP', importance: 'high' as const },
      { id: 'UMCSENT', importance: 'medium' as const },
      { id: 'ICSA', importance: 'medium' as const },
    ];

    const events: FREDEconomicEvent[] = [];

    for (const series of calendarSeries) {
      try {
        const releaseInfo = await this.fetch<{
          release: { id: number; name: string };
        }>(`/series/release?series_id=${series.id}`);

        const latest = await this.getLatestValue(series.id);

        events.push({
          seriesId: series.id,
          title: latest?.title || series.id,
          releaseDate: latest?.lastUpdated || '',
          value: latest?.value?.toString() || null,
          previousValue: latest?.previousValue?.toString() || null,
          importance: series.importance,
        });
      } catch {
        // Skip failed series
      }
    }

    return events;
  }

  /**
   * Get Fed rate trend (hawkish/dovish/neutral).
   * Based on the direction of the Federal Funds Rate.
   */
  async getFedRateTrend(): Promise<'hawkish' | 'dovish' | 'neutral'> {
    try {
      const fedRate = await this.getLatestValue('FEDFUNDS');
      if (!fedRate) return 'neutral';

      if (fedRate.change > 0.1) return 'hawkish';   // Rates rising
      if (fedRate.change < -0.1) return 'dovish';    // Rates falling
      return 'neutral';
    } catch {
      return 'neutral';
    }
  }

  /**
   * Health check — verify FRED API key works.
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.fetch('/series?series_id=FEDFUNDS');
      return true;
    } catch {
      return false;
    }
  }
}
