import { NextRequest, NextResponse } from 'next/server';
import { TradeAudit } from '@/lib/audit/trade-audit';

const audit = TradeAudit.getInstance();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const symbol = searchParams.get('symbol');
    const eventType = searchParams.get('eventType');

    let events;

    if (symbol) {
      events = audit.getEventsBySymbol(symbol);
    } else if (eventType) {
      events = audit.getEventsByType(eventType as 'signal_generated' | 'trade_assessed' | 'trade_executed' | 'trade_closed' | 'risk_warning' | 'alert_triggered');
    } else {
      events = audit.getRecentEvents(limit);
    }

    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch audit events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const event = audit.logEvent({
      eventType: body.eventType,
      symbol: body.symbol,
      direction: body.direction,
      price: body.price,
      quantity: body.quantity,
      pnl: body.pnl,
      details: body.details || '{}',
    });

    return NextResponse.json({ event });
  } catch {
    return NextResponse.json({ error: 'Failed to log audit event' }, { status: 500 });
  }
}
