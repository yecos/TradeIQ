import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const config = await db.brokerConfig.findFirst();
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch broker config' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brokerName, apiKey, apiSecret, isPaper } = body;

    // Delete existing config and create new one
    await db.brokerConfig.deleteMany({});
    const config = await db.brokerConfig.create({
      data: {
        brokerName: brokerName || 'alpaca',
        apiKey: apiKey || '',
        apiSecret: apiSecret || '',
        isPaper: isPaper !== false,
        isActive: !!(apiKey && apiSecret),
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save broker config' }, { status: 500 });
  }
}
