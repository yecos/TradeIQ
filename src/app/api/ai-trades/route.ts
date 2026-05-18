import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ─── GET /api/ai-trades ─────────────────────────────────────────────────────
// Query params:
//   ?status=PENDING     — filter by status
//   ?symbol=BTC         — filter by symbol
//   ?direction=LONG      — filter by direction
//   ?stats=true          — return aggregated statistics instead of list
//   ?limit=50            — max results (default 100)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const symbol = searchParams.get('symbol');
    const direction = searchParams.get('direction');
    const statsOnly = searchParams.get('stats') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

    // ─── Stats mode ───
    if (statsOnly) {
      const trades = await db.aITradeRecord.findMany({
        where: { status: { in: ['HIT_TP', 'HIT_SL', 'EXPIRED', 'MANUAL_CLOSE'] } },
        orderBy: { createdAt: 'desc' },
      });

      const totalTrades = trades.length;
      const wins = trades.filter(t => t.status === 'HIT_TP').length;
      const losses = trades.filter(t => t.status === 'HIT_SL').length;
      const expired = trades.filter(t => t.status === 'EXPIRED').length;
      const manualCloses = trades.filter(t => t.status === 'MANUAL_CLOSE').length;
      const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;

      const totalPnl = trades.reduce((sum, t) => sum + (t.pnlPercent ?? 0), 0);
      const avgPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;

      const winsPnl = trades.filter(t => t.pnlPercent && t.pnlPercent > 0).reduce((s, t) => s + (t.pnlPercent ?? 0), 0);
      const lossesPnl = Math.abs(trades.filter(t => t.pnlPercent && t.pnlPercent < 0).reduce((s, t) => s + (t.pnlPercent ?? 0), 0));
      const profitFactor = lossesPnl > 0 ? winsPnl / lossesPnl : winsPnl > 0 ? 999 : 0;

      // Win rate by direction
      const longTrades = trades.filter(t => t.direction === 'LONG');
      const shortTrades = trades.filter(t => t.direction === 'SHORT');
      const longWinRate = longTrades.length > 0 ? Math.round((longTrades.filter(t => t.status === 'HIT_TP').length / longTrades.length) * 100) : 0;
      const shortWinRate = shortTrades.length > 0 ? Math.round((shortTrades.filter(t => t.status === 'HIT_TP').length / shortTrades.length) * 100) : 0;

      // Win rate by confidence
      const altaTrades = trades.filter(t => t.confidence === 'Alta');
      const mediaTrades = trades.filter(t => t.confidence === 'Media');
      const bajaTrades = trades.filter(t => t.confidence === 'Baja');
      const altaWinRate = altaTrades.length > 0 ? Math.round((altaTrades.filter(t => t.status === 'HIT_TP').length / altaTrades.length) * 100) : 0;
      const mediaWinRate = mediaTrades.length > 0 ? Math.round((mediaTrades.filter(t => t.status === 'HIT_TP').length / mediaTrades.length) * 100) : 0;
      const bajaWinRate = bajaTrades.length > 0 ? Math.round((bajaTrades.filter(t => t.status === 'HIT_TP').length / bajaTrades.length) * 100) : 0;

      // Win rate by symbol (top 5)
      const symbolMap = new Map<string, { total: number; wins: number }>();
      for (const t of trades) {
        const s = symbolMap.get(t.symbol) ?? { total: 0, wins: 0 };
        s.total++;
        if (t.status === 'HIT_TP') s.wins++;
        symbolMap.set(t.symbol, s);
      }
      const bySymbol = Array.from(symbolMap.entries())
        .map(([symbol, data]) => ({ symbol, total: data.total, wins: data.wins, winRate: Math.round((data.wins / data.total) * 100) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      // Current streak
      let currentStreak = 0;
      let streakType = '';
      for (const t of trades) {
        if (t.status === 'HIT_TP') {
          if (streakType === 'win' || streakType === '') { currentStreak++; streakType = 'win'; }
          else break;
        } else if (t.status === 'HIT_SL') {
          if (streakType === 'loss' || streakType === '') { currentStreak++; streakType = 'loss'; }
          else break;
        } else {
          break;
        }
      }

      // Pending trades count
      const pendingCount = await db.aITradeRecord.count({ where: { status: 'PENDING' } });

      // Equity curve data (cumulative PnL)
      let cumPnl = 0;
      const equityCurve = trades
        .filter(t => t.pnlPercent != null)
        .reverse()
        .map(t => {
          cumPnl += t.pnlPercent ?? 0;
          return { date: t.resolvedAt ?? t.createdAt, pnl: Math.round(cumPnl * 100) / 100 };
        });

      return NextResponse.json({
        totalTrades,
        wins,
        losses,
        expired,
        manualCloses,
        winRate,
        avgPnl: Math.round(avgPnl * 100) / 100,
        profitFactor: Math.round(profitFactor * 100) / 100,
        longWinRate,
        shortWinRate,
        altaWinRate,
        mediaWinRate,
        bajaWinRate,
        bySymbol,
        currentStreak: { count: currentStreak, type: streakType },
        pendingCount,
        equityCurve,
      });
    }

    // ─── List mode ───
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (symbol) where.symbol = symbol;
    if (direction) where.direction = direction;

    const trades = await db.aITradeRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ trades });
  } catch (error) {
    console.error('[AI Trades] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}

// ─── POST /api/ai-trades ────────────────────────────────────────────────────
// Create a new AI trade record

interface CreateTradeBody {
  symbol: string;
  timeframe: string;
  direction: string;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
  confidence?: string;
  confluenceScore?: number;
  aiAnalysis?: string;
  expiresAt?: string; // ISO date string
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateTradeBody = await request.json();
    const { symbol, timeframe, direction, entryPrice, stopLoss, takeProfit, riskReward, confidence, confluenceScore, aiAnalysis, expiresAt } = body;

    if (!symbol || !direction || !entryPrice) {
      return NextResponse.json({ error: 'symbol, direction, and entryPrice are required' }, { status: 400 });
    }

    const trade = await db.aITradeRecord.create({
      data: {
        symbol: symbol.toUpperCase(),
        timeframe: timeframe || '1D',
        direction,
        entryPrice,
        stopLoss: stopLoss ?? null,
        takeProfit: takeProfit ?? null,
        riskReward: riskReward ?? null,
        confidence: confidence ?? null,
        confluenceScore: confluenceScore ?? null,
        aiAnalysis: aiAnalysis ?? '',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    return NextResponse.json({ trade }, { status: 201 });
  } catch (error) {
    console.error('[AI Trades] POST error:', error);
    return NextResponse.json({ error: 'Failed to create trade' }, { status: 500 });
  }
}

// ─── PATCH /api/ai-trades (bulk update — used for manual close) ─────────────
// Body: { id: string, status: string, actualExitPrice?: number, notes?: string }

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      id: string;
      status: string;
      actualExitPrice?: number;
      notes?: string;
    };

    if (!body.id || !body.status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const trade = await db.aITradeRecord.findUnique({ where: { id: body.id } });
    if (!trade) {
      return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    }

    // Calculate PnL if exit price provided
    let pnlPercent: number | null = null;
    if (body.actualExitPrice && trade.entryPrice) {
      if (trade.direction === 'LONG') {
        pnlPercent = ((body.actualExitPrice - trade.entryPrice) / trade.entryPrice) * 100;
      } else if (trade.direction === 'SHORT') {
        pnlPercent = ((trade.entryPrice - body.actualExitPrice) / trade.entryPrice) * 100;
      }
    }

    const updated = await db.aITradeRecord.update({
      where: { id: body.id },
      data: {
        status: body.status,
        actualExitPrice: body.actualExitPrice ?? trade.actualExitPrice,
        pnlPercent: pnlPercent ?? trade.pnlPercent,
        notes: body.notes ?? trade.notes,
        resolvedAt: new Date(),
      },
    });

    return NextResponse.json({ trade: updated });
  } catch (error) {
    console.error('[AI Trades] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update trade' }, { status: 500 });
  }
}

// ─── DELETE /api/ai-trades?id=xxx ───────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await db.aITradeRecord.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AI Trades] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete trade' }, { status: 500 });
  }
}
