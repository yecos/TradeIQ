import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');
    const stats = searchParams.get('stats');
    // CSV export
    if (format === 'csv') {
      const entries = await db.journalEntry.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });

      const headers = [
        'ID',
        'Símbolo',
        'Dirección',
        'Precio Entrada',
        'Precio Salida',
        'Stop Loss',
        'Take Profit',
        'Resultado',
        'P&L',
        'Notas',
        'Lecciones',
        'Vectores',
        'Fecha',
      ];

      const rows = entries.map((e) => [
        e.id,
        e.symbol,
        e.direction,
        e.entryPrice.toString(),
        e.exitPrice?.toString() || '',
        e.stopLoss.toString(),
        e.takeProfit.toString(),
        e.result || '',
        e.pnl?.toString() || '',
        `"${(e.notes || '').replace(/"/g, '""')}"`,
        `"${(e.lessons || '').replace(/"/g, '""')}"`,
        e.vectorsUsed || '[]',
        e.createdAt.toISOString(),
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename=bitacora_tradeiq.csv',
        },
      });
    }

    // Stats
    if (stats === 'true') {
      const entries = await db.journalEntry.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });

      const totalTrades = entries.length;
      const wins = entries.filter((e) => e.result === 'win');
      const losses = entries.filter((e) => e.result === 'loss');
      const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;

      const pnlValues = entries.filter((e) => e.pnl != null).map((e) => e.pnl as number);
      const avgPnl = pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0;

      const totalWinPnl = wins.filter((e) => e.pnl != null).reduce((acc, e) => acc + (e.pnl as number), 0);
      const totalLossPnl = Math.abs(losses.filter((e) => e.pnl != null).reduce((acc, e) => acc + (e.pnl as number), 0));
      const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : totalWinPnl > 0 ? Infinity : 0;

      const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
      const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;

      // Avg Risk:Reward
      const rrValues = entries
        .filter((e) => e.stopLoss > 0 && e.takeProfit > 0)
        .map((e) => {
          const risk = Math.abs(e.entryPrice - e.stopLoss);
          const reward = Math.abs(e.takeProfit - e.entryPrice);
          return risk > 0 ? reward / risk : 0;
        });
      const avgRR = rrValues.length > 0 ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0;

      return NextResponse.json({
        stats: {
          totalTrades,
          wins: wins.length,
          losses: losses.length,
          winRate: Math.round(winRate * 100) / 100,
          avgPnl: Math.round(avgPnl * 100) / 100,
          profitFactor: Math.round(profitFactor * 100) / 100,
          bestTrade: Math.round(bestTrade * 100) / 100,
          worstTrade: Math.round(worstTrade * 100) / 100,
          avgRR: Math.round(avgRR * 100) / 100,
        },
      });
    }

    // Default: return entries
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

    // Log audit event
    const { TradeAudit } = await import('@/lib/audit/trade-audit');
    const audit = TradeAudit.getInstance();
    audit.logEvent({
      eventType: body.result ? 'trade_closed' : 'trade_executed',
      symbol: body.symbol,
      direction: body.direction,
      price: body.entryPrice,
      quantity: undefined,
      pnl: body.pnl,
      details: JSON.stringify({
        entryPrice: body.entryPrice,
        exitPrice: body.exitPrice,
        stopLoss: body.stopLoss,
        takeProfit: body.takeProfit,
        result: body.result,
        vectorsUsed: body.vectorsUsed,
      }),
    });

    return NextResponse.json({ entry });
  } catch {
    return NextResponse.json({ error: 'Failed to create journal entry' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const entry = await db.journalEntry.delete({
      where: { id },
    });

    return NextResponse.json({ entry });
  } catch {
    return NextResponse.json({ error: 'Failed to delete journal entry' }, { status: 500 });
  }
}
