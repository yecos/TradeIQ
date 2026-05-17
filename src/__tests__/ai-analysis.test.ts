import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: z-ai-web-dev-sdk  (must be before any import that uses getSDK)
// ---------------------------------------------------------------------------

const mockChatCreate = vi.fn().mockResolvedValue({
  choices: [{
    message: {
      content: JSON.stringify({
        sentiment: 0.5,
        sentimentLabel: 'bullish',
        confidence: 75,
        headlines: [
          { title: 'BTC rises on institutional demand', sentiment: 0.6, impact: 'high', category: 'market' },
        ],
        events: [{ type: 'product_launch', description: 'New ETF approval', impact: 'high' }],
        keyRisks: ['regulatory uncertainty'],
        keyCatalysts: ['institutional adoption'],
      }),
    },
  }],
});

const mockFunctionsInvoke = vi.fn().mockImplementation((fn: string) => {
  if (fn === 'web_search') {
    return Promise.resolve([
      { name: 'Test News', snippet: 'Test snippet about BTC', url: 'https://example.com/news1' },
      { name: 'Test News 2', snippet: 'Another test about BTC', url: 'https://example.com/news2' },
    ]);
  }
  if (fn === 'web_reader') {
    return Promise.resolve(null);
  }
  return Promise.resolve(null);
});

const mockSDK = {
  functions: { invoke: mockFunctionsInvoke },
  chat: { completions: { create: mockChatCreate } },
};

vi.mock('z-ai-web-dev-sdk', () => ({
  default: {
    create: vi.fn().mockResolvedValue(mockSDK),
  },
}));

// ---------------------------------------------------------------------------
// Mock: global fetch (for Fear & Greed and CoinGecko APIs)
// ---------------------------------------------------------------------------

const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ data: [{ value: '65', value_classification: 'Greed' }] }),
});

global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AI SDK Singleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export getSDK function', async () => {
    const { getSDK } = await import('../lib/ai/sdk');
    expect(typeof getSDK).toBe('function');
  });

  it('should return an SDK instance', async () => {
    const { getSDK } = await import('../lib/ai/sdk');
    const sdk = await getSDK();
    expect(sdk).toBeDefined();
    expect(sdk.functions).toBeDefined();
    expect(sdk.chat).toBeDefined();
  });

  it('should return the same instance on subsequent calls', async () => {
    const { getSDK } = await import('../lib/ai/sdk');
    const sdk1 = await getSDK();
    const sdk2 = await getSDK();
    expect(sdk1).toBe(sdk2);
  });
});

describe('AI Prompts', () => {
  it('should export NEWS_ANALYSIS_PROMPT', async () => {
    const { NEWS_ANALYSIS_PROMPT } = await import('../lib/ai/prompts');
    expect(NEWS_ANALYSIS_PROMPT).toBeDefined();
    expect(typeof NEWS_ANALYSIS_PROMPT).toBe('string');
    expect(NEWS_ANALYSIS_PROMPT).toContain('sentiment');
    expect(NEWS_ANALYSIS_PROMPT).toContain('headlines');
    expect(NEWS_ANALYSIS_PROMPT).toContain('events');
    expect(NEWS_ANALYSIS_PROMPT).toContain('keyRisks');
    expect(NEWS_ANALYSIS_PROMPT).toContain('keyCatalysts');
  });

  it('should export SENTIMENT_ANALYSIS_PROMPT', async () => {
    const { SENTIMENT_ANALYSIS_PROMPT } = await import('../lib/ai/prompts');
    expect(SENTIMENT_ANALYSIS_PROMPT).toBeDefined();
    expect(typeof SENTIMENT_ANALYSIS_PROMPT).toBe('string');
    expect(SENTIMENT_ANALYSIS_PROMPT).toContain('socialSentiment');
    expect(SENTIMENT_ANALYSIS_PROMPT).toContain('contrarianSignal');
    expect(SENTIMENT_ANALYSIS_PROMPT).toContain('dominantEmotion');
  });

  it('should export MACRO_ANALYSIS_PROMPT', async () => {
    const { MACRO_ANALYSIS_PROMPT } = await import('../lib/ai/prompts');
    expect(MACRO_ANALYSIS_PROMPT).toBeDefined();
    expect(typeof MACRO_ANALYSIS_PROMPT).toBe('string');
    expect(MACRO_ANALYSIS_PROMPT).toContain('fedRateTrend');
    expect(MACRO_ANALYSIS_PROMPT).toContain('riskEnvironment');
    expect(MACRO_ANALYSIS_PROMPT).toContain('sectorImpact');
  });
});

describe('Article Reader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export readArticle and readArticles', async () => {
    const { readArticle, readArticles } = await import('../lib/ai/article-reader');
    expect(typeof readArticle).toBe('function');
    expect(typeof readArticles).toBe('function');
  });

  it('should return null when web_reader returns null', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce(null);
    const { readArticle } = await import('../lib/ai/article-reader');
    const result = await readArticle('https://example.com');
    expect(result).toBeNull();
  });

  it('should return article content when web_reader succeeds', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      title: 'Test Article',
      content: 'This is the full article content that should be captured by the reader.',
      published_time: '2025-01-01',
    });
    const { readArticle } = await import('../lib/ai/article-reader');
    const result = await readArticle('https://example.com/article');
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Test Article');
    expect(result?.url).toBe('https://example.com/article');
  });

  it('readArticles should filter out null results', async () => {
    mockFunctionsInvoke.mockResolvedValue(null);
    const { readArticles } = await import('../lib/ai/article-reader');
    const results = await readArticles(['https://example.com/1', 'https://example.com/2'], 2);
    expect(results).toEqual([]);
  });
});

describe('News Analysis Enhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock behavior for web_search
    mockFunctionsInvoke.mockImplementation((fn: string) => {
      if (fn === 'web_search') {
        return Promise.resolve([
          { name: 'Test News', snippet: 'Test snippet about BTC', url: 'https://example.com/news1' },
          { name: 'Test News 2', snippet: 'Another test about BTC', url: 'https://example.com/news2' },
        ]);
      }
      if (fn === 'web_reader') {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });
    // Reset default mock for chat completions
    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            sentiment: 0.5,
            sentimentLabel: 'bullish',
            confidence: 75,
            headlines: [
              { title: 'BTC rises on institutional demand', sentiment: 0.6, impact: 'high', category: 'market' },
            ],
            events: [{ type: 'product_launch', description: 'New ETF approval', impact: 'high' }],
            keyRisks: ['regulatory uncertainty'],
            keyCatalysts: ['institutional adoption'],
          }),
        },
      }],
    });
  });

  it('should return news analysis with valid structure', async () => {
    const { analyzeNews } = await import('../lib/news-analysis');
    const result = await analyzeNews('BTC');

    expect(result).toBeDefined();
    expect(result.sentiment).toBeGreaterThanOrEqual(-1);
    expect(result.sentiment).toBeLessThanOrEqual(1);
    expect(['very_bearish', 'bearish', 'neutral', 'bullish', 'very_bullish']).toContain(result.sentimentLabel);
    expect(Array.isArray(result.headlines)).toBe(true);
    expect(Array.isArray(result.signals)).toBe(true);
  });

  it('should cache results for the same symbol', async () => {
    const { analyzeNews } = await import('../lib/news-analysis');
    const result1 = await analyzeNews('ETH');
    const result2 = await analyzeNews('ETH');
    expect(result1).toBe(result2); // Same reference = cached
  });

  it('should have signal with valid structure', async () => {
    const { analyzeNews } = await import('../lib/news-analysis');
    const result = await analyzeNews('BTC');

    if (result.signals.length > 0) {
      const signal = result.signals[0];
      expect(signal.vectorId).toBe('news');
      expect(['LONG', 'SHORT', 'NEUTRAL']).toContain(signal.direction);
      expect(signal.strength).toBeGreaterThanOrEqual(0);
      expect(signal.strength).toBeLessThanOrEqual(100);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(100);
      expect(typeof signal.detail).toBe('string');
    }
  });

  it('should fallback to simulated data on failure', async () => {
    // Make the SDK throw
    mockFunctionsInvoke.mockRejectedValue(new Error('SDK error'));
    mockChatCreate.mockRejectedValue(new Error('SDK error'));

    const { analyzeNews } = await import('../lib/news-analysis');
    const result = await analyzeNews('UNKNOWN_SYMBOL_XYZ');
    expect(result).toBeDefined();
    expect(result.signals).toBeDefined();
    expect(Array.isArray(result.signals)).toBe(true);
  });

  it('should use enhanced prompt with events and keyRisks', async () => {
    const { analyzeNews } = await import('../lib/news-analysis');
    // Use a unique symbol not cached by earlier tests
    await analyzeNews('META');

    // Verify the chat completion was called with the enhanced prompt
    expect(mockChatCreate).toHaveBeenCalled();
    const call = mockChatCreate.mock.calls[0];
    const systemMessage = call?.[0]?.messages?.[0]?.content;
    expect(systemMessage).toContain('keyRisks');
    expect(systemMessage).toContain('keyCatalysts');
    expect(systemMessage).toContain('events');
  });
});

describe('Sentiment Analysis Enhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock behavior
    mockFunctionsInvoke.mockImplementation((fn: string) => {
      if (fn === 'web_search') {
        return Promise.resolve([
          { name: 'Social Post', snippet: 'BTC sentiment positive', url: 'https://example.com/post1' },
        ]);
      }
      return Promise.resolve(null);
    });
    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            socialSentiment: 0.6,
            confidence: 70,
            dominantEmotion: 'greed',
            narrativeStrength: 65,
            putCallRatio: 0.8,
            keyThemes: ['institutional adoption', 'ETF approval'],
            contrarianSignal: false,
          }),
        },
      }],
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ value: '65', value_classification: 'Greed' }] }),
    });
  });

  it('should return sentiment analysis with valid structure', async () => {
    const { analyzeSentiment } = await import('../lib/sentiment-analysis');
    const result = await analyzeSentiment('BTC');

    expect(result).toBeDefined();
    expect(typeof result.fearGreedIndex).toBe('number');
    expect(result.fearGreedIndex).toBeGreaterThanOrEqual(0);
    expect(result.fearGreedIndex).toBeLessThanOrEqual(100);
    expect(typeof result.socialSentiment).toBe('number');
    expect(result.socialSentiment).toBeGreaterThanOrEqual(-1);
    expect(result.socialSentiment).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.signals)).toBe(true);
  });

  it('should have sentiment signal with correct vectorId', async () => {
    const { analyzeSentiment } = await import('../lib/sentiment-analysis');
    const result = await analyzeSentiment('NVDA');

    if (result.signals.length > 0) {
      expect(result.signals[0].vectorId).toBe('sentiment');
    }
  });

  it('should use enhanced prompt with contrarian detection', async () => {
    const { analyzeSentiment } = await import('../lib/sentiment-analysis');
    // Use a unique symbol not cached by earlier tests
    await analyzeSentiment('AMZN');

    expect(mockChatCreate).toHaveBeenCalled();
    const call = mockChatCreate.mock.calls[0];
    const systemMessage = call?.[0]?.messages?.[0]?.content;
    expect(systemMessage).toContain('contrarianSignal');
    expect(systemMessage).toContain('dominantEmotion');
    expect(systemMessage).toContain('narrativeStrength');
  });

  it('should fallback when APIs fail', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    mockFunctionsInvoke.mockRejectedValue(new Error('SDK error'));
    mockChatCreate.mockRejectedValue(new Error('SDK error'));

    const { analyzeSentiment } = await import('../lib/sentiment-analysis');
    const result = await analyzeSentiment('TSLA');
    expect(result).toBeDefined();
    expect(result.signals).toBeDefined();
    expect(Array.isArray(result.signals)).toBe(true);
  });
});

describe('Macro Analysis Enhanced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFunctionsInvoke.mockImplementation((fn: string) => {
      if (fn === 'web_search') {
        return Promise.resolve([
          { name: 'Fed News', snippet: 'Fed holds rates steady', url: 'https://example.com/fed' },
          { name: 'CPI Data', snippet: 'CPI comes in as expected', url: 'https://example.com/cpi' },
        ]);
      }
      return Promise.resolve(null);
    });
    mockChatCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            fedRateTrend: 'neutral',
            rateDirection: 'stable',
            economicEvents: [
              { event: 'FOMC Meeting', impact: 'high', forecast: null, previous: null },
            ],
            macroSentiment: 0.1,
            inflationTrend: 'stable',
            employmentTrend: 'stable',
            riskEnvironment: 'neutral',
            macroDetail: 'Markets in a holding pattern',
            sectorImpact: { technology: 0.1, financials: 0.0, energy: -0.1, crypto: 0.2 },
          }),
        },
      }],
    });
  });

  it('should return macro analysis with valid structure', async () => {
    const { analyzeMacro } = await import('../lib/macro-analysis');
    const result = await analyzeMacro('BTC');

    expect(result).toBeDefined();
    expect(['hawkish', 'dovish', 'neutral']).toContain(result.fedRateTrend);
    expect(Array.isArray(result.economicEvents)).toBe(true);
    expect(Array.isArray(result.signals)).toBe(true);
  });

  it('should have economic events with valid structure', async () => {
    const { analyzeMacro } = await import('../lib/macro-analysis');
    const result = await analyzeMacro();

    for (const event of result.economicEvents) {
      expect(typeof event.event).toBe('string');
      expect(['high', 'medium', 'low']).toContain(event.impact);
      expect(typeof event.date).toBe('string');
    }
  });

  it('should have macro signal with correct vectorId', async () => {
    const { analyzeMacro } = await import('../lib/macro-analysis');
    const result = await analyzeMacro('AAPL');

    if (result.signals.length > 0) {
      expect(result.signals[0].vectorId).toBe('macro');
    }
  });

  it('should use enhanced prompt with risk environment and sector impact', async () => {
    const { analyzeMacro } = await import('../lib/macro-analysis');
    // Use a unique symbol not cached by earlier tests
    await analyzeMacro('GOOG');

    expect(mockChatCreate).toHaveBeenCalled();
    const call = mockChatCreate.mock.calls[0];
    const systemMessage = call?.[0]?.messages?.[0]?.content;
    expect(systemMessage).toContain('riskEnvironment');
    expect(systemMessage).toContain('sectorImpact');
    expect(systemMessage).toContain('inflationTrend');
    expect(systemMessage).toContain('employmentTrend');
  });

  it('should fallback to simulated data on failure', async () => {
    mockFunctionsInvoke.mockRejectedValue(new Error('SDK error'));
    mockChatCreate.mockRejectedValue(new Error('SDK error'));

    const { analyzeMacro } = await import('../lib/macro-analysis');
    const result = await analyzeMacro('UNKNOWN');
    expect(result).toBeDefined();
    expect(result.signals).toBeDefined();
    expect(result.fedRateTrend).toBeDefined();
    expect(['hawkish', 'dovish', 'neutral']).toContain(result.fedRateTrend);
  });
});
