import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const entries = await db.journalEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch journal' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry = await db.journalEntry.create({
      data: {
        symbol: body.symbol,
        direction: body.direction,
        entryPrice: body.entryPrice,
        exitPrice: body.exitPrice,
        stopLoss: body.stopLoss,
        takeProfit: body.takeProfit,
        result: body.result,
        pnl: body.pnl,
        notes: body.notes || '',
        lessons: body.lessons || '',
        vectorsUsed: JSON.stringify(body.vectorsUsed || []),
      },
    });
    return NextResponse.json({ entry });
  } catch {
    return NextResponse.json({ error: 'Failed to create journal entry' }, { status: 500 });
  }
}
