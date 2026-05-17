import { NextResponse } from 'next/server';

/**
 * GET /api/health — Health check endpoint for monitoring and Docker HEALTHCHECK.
 *
 * Returns:
 * - status: "ok" if the app is running
 * - timestamp: current server time
 * - uptime: seconds since the server started
 * - version: application version
 * - checks: subsystem health statuses
 * - memory: Node.js memory usage
 */
export async function GET() {
  const start = Date.now();

  // Basic health checks
  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

  // Check 1: Database connectivity
  try {
    const { db } = await import('@/lib/db');
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
  } catch (error) {
    checks.database = {
      status: 'error',
      error: error instanceof Error ? error.message : 'unknown',
    };
  }

  // Check 2: Memory usage
  const memUsage = process.memoryUsage();
  checks.memory = {
    status: memUsage.heapUsed < 500 * 1024 * 1024 ? 'ok' : 'warning',
  };

  // Determine overall status
  const hasErrors = Object.values(checks).some(c => c.status === 'error');
  const overallStatus = hasErrors ? 'degraded' : 'ok';

  const responseTime = Date.now() - start;

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '0.18.0',
    responseTimeMs: responseTime,
    checks,
    memory: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMB: Math.round(memUsage.rss / 1024 / 1024),
    },
  }, {
    status: overallStatus === 'ok' ? 200 : 503,
  });
}
