import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const maxDuration = 30;

// ─── POST /api/ai-trades/check ──────────────────────────────────────────────
// Auto-verify all PENDING trades against current market prices.
// Called periodically by the frontend or by a cron job.

export async function POST() {
  try {
    // Get all pending trades
    const pendingTrades = await db.aITradeRecord.findMany({
      where: { status: 'PENDING' },
    });

    if (pendingTrades.length === 0) {
      return NextResponse.json({ checked: 0, resolved: [], message: 'No pending trades' });
    }

    // Collect unique symbols to fetch prices
    const symbols = [...new Set(pendingTrades.map(t => t.symbol))];
    const priceMap = new Map<string, number>();

    // Fetch current prices for all symbols
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/market/quote?symbols=${symbol}`, {
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const data = await res.json();
            const quote = data.quotes?.[0];
            if (quote?.price != null) {
              priceMap.set(symbol, quote.price);
            }
          }
        } catch {
          // Skip failed price fetches
        }
      })
    );

    const resolved: Array<{ id: string; symbol: string; direction: string; status: string; pnlPercent: number }> = [];
    const now = new Date();

    for (const trade of pendingTrades) {
      const currentPrice = priceMap.get(trade.symbol);
      if (currentPrice == null) continue;

      let newStatus: string | null = null;
      let pnlPercent: number | null = null;

      // Check if price hit Take Profit
      if (trade.takeProfit != null) {
        if (trade.direction === 'LONG' && currentPrice >= trade.takeProfit) {
          newStatus = 'HIT_TP';
          pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
        } else if (trade.direction === 'SHORT' && currentPrice <= trade.takeProfit) {
          newStatus = 'HIT_TP';
          pnlPercent = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
        }
      }

      // Check if price hit Stop Loss
      if (!newStatus && trade.stopLoss != null) {
        if (trade.direction === 'LONG' && currentPrice <= trade.stopLoss) {
          newStatus = 'HIT_SL';
          pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
        } else if (trade.direction === 'SHORT' && currentPrice >= trade.stopLoss) {
          newStatus = 'HIT_SL';
          pnlPercent = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
        }
      }

      // Check if trade expired
      if (!newStatus && trade.expiresAt && now >= trade.expiresAt) {
        newStatus = 'EXPIRED';
        if (trade.direction === 'LONG') {
          pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
        } else if (trade.direction === 'SHORT') {
          pnlPercent = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
        }
      }

      // Update MFE/MAE (max favorable/adverse excursion)
      let maxFavorable = trade.maxFavorable ?? 0;
      let maxAdverse = trade.maxAdverse ?? 0;

      if (trade.direction === 'LONG') {
        const favorable = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
        const adverse = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
        if (favorable > maxFavorable) maxFavorable = favorable;
        if (adverse > maxAdverse) maxAdverse = adverse;
      } else if (trade.direction === 'SHORT') {
        const favorable = ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
        const adverse = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100;
        if (favorable > maxFavorable) maxFavorable = favorable;
        if (adverse > maxAdverse) maxAdverse = adverse;
      }

      // Update the trade
      if (newStatus) {
        await db.aITradeRecord.update({
          where: { id: trade.id },
          data: {
            status: newStatus,
            actualExitPrice: currentPrice,
            pnlPercent: Math.round((pnlPercent ?? 0) * 100) / 100,
            maxFavorable: Math.round(maxFavorable * 100) / 100,
            maxAdverse: Math.round(maxAdverse * 100) / 100,
            resolvedAt: now,
          },
        });
        resolved.push({
          id: trade.id,
          symbol: trade.symbol,
          direction: trade.direction,
          status: newStatus,
          pnlPercent: Math.round((pnlPercent ?? 0) * 100) / 100,
        });
      } else {
        // Just update MFE/MAE
        await db.aITradeRecord.update({
          where: { id: trade.id },
          data: {
            maxFavorable: Math.round(maxFavorable * 100) / 100,
            maxAdverse: Math.round(maxAdverse * 100) / 100,
          },
        });
      }
    }

    return NextResponse.json({
      checked: pendingTrades.length,
      resolved,
      prices: Object.fromEntries(priceMap),
    });
  } catch (error) {
    console.error('[AI Trades Check] Error:', error);
    return NextResponse.json({ error: 'Failed to check trades' }, { status: 500 });
  }
}
