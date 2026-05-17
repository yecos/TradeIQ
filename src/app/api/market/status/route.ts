import { NextResponse } from 'next/server';
import { getProviderName, isRealDataAvailable, isFallbackActive, getActiveProviders, getMarketDataProvider } from '@/lib/data/provider-factory';

export async function GET() {
  try {
    const provider = getMarketDataProvider();
    const qualityReport = provider.getDataQualityReport();

    return NextResponse.json({
      provider: getProviderName(),
      isRealData: isRealDataAvailable(),
      isFallback: isFallbackActive(),
      activeProviders: getActiveProviders(),
      dataQuality: qualityReport,
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json({
      provider: 'mock',
      isRealData: false,
      isFallback: false,
      activeProviders: ['mock'],
      dataQuality: {
        source: 'mock' as const,
        isMockData: true,
        isStale: false,
        staleSymbols: [],
        lastRealDataTime: null,
        warnings: ['All data is simulated. Do NOT trade with real money.'],
      },
      timestamp: Date.now(),
    });
  }
}
