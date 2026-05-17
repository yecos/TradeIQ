import { NextResponse } from 'next/server';
import { getProviderName, isRealDataAvailable, isFallbackActive, getActiveProviders } from '@/lib/data/provider-factory';

export async function GET() {
  try {
    return NextResponse.json({
      provider: getProviderName(),
      isRealData: isRealDataAvailable(),
      isFallback: isFallbackActive(),
      activeProviders: getActiveProviders(),
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json({
      provider: 'mock',
      isRealData: false,
      isFallback: false,
      activeProviders: ['mock'],
      timestamp: Date.now(),
    });
  }
}
