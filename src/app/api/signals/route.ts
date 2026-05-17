import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const signals = await db.signal.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({ signals });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch signals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, direction, entryPrice, stopLoss, takeProfit, riskReward, confluenceScore, vectorsUsed, analysisDetail } = body;

    const signal = await db.signal.create({
      data: {
        symbol,
        direction,
        entryPrice,
        stopLoss,
        takeProfit,
        riskReward,
        confluenceScore,
        vectorsUsed: JSON.stringify(vectorsUsed),
        analysisDetail: JSON.stringify(analysisDetail),
      },
    });

    return NextResponse.json({ signal });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create signal' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body;

    const signal = await db.signal.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ signal });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update signal' }, { status: 500 });
  }
}
