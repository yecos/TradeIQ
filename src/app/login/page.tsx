'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Target, AlertTriangle, Loader2, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';

type AuthMode = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === 'register') {
        // Register new account
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Error al crear cuenta');
          return;
        }

        // Auto-login after registration
        const signInResult = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (signInResult?.error) {
          setError('Cuenta creada. Inicia sesión manualmente.');
          setMode('login');
          return;
        }

        router.push('/');
        router.refresh();
      } else {
        // Login
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });

        if (result?.error) {
          setError('Email o contraseña incorrectos');
          return;
        }

        router.push('/');
        router.refresh();
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center trading-bg text-white p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-4">
            <Target className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold">TradeIQ</h1>
          <p className="text-gray-500 text-sm mt-1">
            Plataforma de Análisis de Trading con IA
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-[#0d0d14] border border-white/10 rounded-2xl p-6 shadow-2xl">
          {/* Mode Toggle */}
          <div className="flex mb-6 bg-white/5 rounded-lg p-1">
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'login'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => { setMode('login'); setError(null); }}
            >
              Iniciar Sesión
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'register'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => { setMode('register'); setError(null); }}
            >
              Crear Cuenta
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-300">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name (register only) */}
            {mode === 'register' && (
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Nombre</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full h-10 pl-10 pr-3 text-sm bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-emerald-500/50 text-white placeholder-gray-600"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-10 pl-10 pr-3 text-sm bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-emerald-500/50 text-white placeholder-gray-600"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : 'Tu contraseña'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === 'register' ? 8 : undefined}
                  className="w-full h-10 pl-10 pr-10 text-sm bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-emerald-500/50 text-white placeholder-gray-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {mode === 'login' ? 'Iniciando sesión...' : 'Creando cuenta...'}
                </>
              ) : (
                mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'
              )}
            </Button>
          </form>

          {/* Footer */}
          {mode === 'login' && (
            <p className="text-[10px] text-gray-600 text-center mt-4">
              Demo: Crea una cuenta para acceder a la plataforma
            </p>
          )}
        </div>

        {/* Disclaimer */}
        <div className="mt-6 text-center">
          <p className="text-[10px] text-gray-600 leading-relaxed">
            TradeIQ es una herramienta de análisis. No constituye asesoría financiera.
            Opera bajo tu propio riesgo. Los resultados pasados no garantizan resultados futuros.
          </p>
        </div>
      </div>
    </div>
  );
}
