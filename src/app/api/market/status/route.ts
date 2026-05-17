import { NextResponse } from 'next/server';
import { getProviderName, isRealDataAvailable, isFallbackActive } from '@/lib/data/provider-factory';

export async function GET() {
  try {
    return NextResponse.json({
      provider: getProviderName(),
      isRealData: isRealDataAvailable(),
      isFallback: isFallbackActive(),
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json({
      provider: 'mock',
      isRealData: false,
      isFallback: false,
      timestamp: Date.now(),
    });
  }
}
