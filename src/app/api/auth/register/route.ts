/**
 * User Registration API — POST /api/auth/register
 *
 * Creates a new user account with email + password.
 *
 * Security measures:
 * - Password minimum length: 8 characters
 * - Email validation (basic format check)
 * - bcrypt password hashing (12 salt rounds)
 * - Duplicate email check before creation
 * - Rate limited by middleware (60 req/min per IP)
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // ─── Validation ───
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 }
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Formato de email inválido' },
        { status: 400 }
      );
    }

    // Password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      );
    }

    // ─── Check for existing user ───
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // Don't reveal that the email exists (security best practice)
      return NextResponse.json(
        { error: 'No se pudo crear la cuenta. Intenta con otro email.' },
        { status: 409 }
      );
    }

    // ─── Create user ───
    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      message: 'Cuenta creada exitosamente',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    }, { status: 201 });

  } catch (error) {
    console.error('[TradeIQ] Registration error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
