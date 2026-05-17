import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/alerts — Get all alerts with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const type = searchParams.get('type');
    const isRead = searchParams.get('isRead');
    const severity = searchParams.get('severity');

    const where: Record<string, unknown> = {};

    if (symbol) where.symbol = symbol.toUpperCase();
    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (isRead !== null) {
      where.isRead = isRead === 'true';
    }

    const alerts = await db.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ alerts });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

// POST /api/alerts — Create new alert
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, symbol, title, message, severity, condition } = body;

    // Validation
    if (!type || !symbol || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: type, symbol, title, message' },
        { status: 400 },
      );
    }

    const validTypes = ['price_target', 'confluence', 'risk_event', 'trade_executed', 'position_closed'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 },
      );
    }

    const validSeverities = ['info', 'warning', 'critical'];
    const alertSeverity = validSeverities.includes(severity) ? severity : 'info';

    const alert = await db.alert.create({
      data: {
        type,
        symbol: symbol.toUpperCase(),
        title,
        message,
        severity: alertSeverity,
        condition: condition ? JSON.stringify(condition) : '{}',
        isRead: false,
        isTriggered: type === 'risk_event' || type === 'trade_executed' || type === 'position_closed',
        triggeredAt: (type === 'risk_event' || type === 'trade_executed' || type === 'position_closed')
          ? new Date()
          : null,
      },
    });

    return NextResponse.json({ alert }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create alert' }, { status: 500 });
  }
}

// PATCH /api/alerts — Mark alert as read or update fields
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, isRead, isTriggered } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing alert id' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (isRead !== undefined) data.isRead = isRead;
    if (isTriggered !== undefined) {
      data.isTriggered = isTriggered;
      if (isTriggered) data.triggeredAt = new Date();
    }

    const alert = await db.alert.update({
      where: { id },
      data,
    });

    return NextResponse.json({ alert });
  } catch {
    return NextResponse.json({ error: 'Failed to update alert' }, { status: 500 });
  }
}

// DELETE /api/alerts — Delete alert by id
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing alert id' }, { status: 400 });
    }

    await db.alert.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete alert' }, { status: 500 });
  }
}
