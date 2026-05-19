'use client';

import { useState, useEffect } from 'react';
import {
  Key,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Zap,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ProviderStatus {
  name: string;
  key: string;
  icon: string;
  description: string;
  registerUrl: string;
  isConfigured: boolean;
  isActive: boolean;
  coversAssets: string;
  freeLimit: string;
  color: string;
}

interface DataProviderSetupProps {
  onRefresh?: () => void;
}

export function DataProviderSetup({ onRefresh }: DataProviderSetupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [marketStatus, setMarketStatus] = useState<{
    activeProviders: string[];
    isRealData: boolean;
    dataQuality?: { isMockData: boolean; warnings: string[] };
  } | null>(null);

  useEffect(() => {
    fetch('/api/market/status')
      .then(res => res.json())
      .then(data => setMarketStatus(data))
      .catch(() => {});
  }, []);

  const providers: ProviderStatus[] = [
    {
      name: 'CoinGecko',
      key: '(sin clave)',
      icon: 'CG',
      description: 'Datos de criptomonedas — cotizaciones, velas diarias, búsqueda',
      registerUrl: '',
      isConfigured: true,
      isActive: marketStatus?.activeProviders?.includes('coingecko') ?? true,
      coversAssets: 'Crypto',
      freeLimit: '10-30 req/min',
      color: 'text-emerald-400',
    },
    {
      name: 'Binance',
      key: '(sin clave)',
      icon: 'BIN',
      description: 'Crypto en tiempo real — velas intradía, WebSocket streaming',
      registerUrl: '',
      isConfigured: true,
      isActive: marketStatus?.activeProviders?.includes('binance') ?? true,
      coversAssets: 'Crypto',
      freeLimit: '1200 req/min',
      color: 'text-yellow-400',
    },
    {
      name: 'Finnhub',
      key: 'FINNHUB_API_KEY',
      icon: 'FNH',
      description: 'Acciones, Forex, Noticias, Sentimiento, Calendario de earnings',
      registerUrl: 'https://finnhub.io/register',
      isConfigured: !!process.env.NEXT_PUBLIC_FINNHUB_KEY || marketStatus?.activeProviders?.includes('finnhub') || false,
      isActive: marketStatus?.activeProviders?.includes('finnhub') ?? false,
      coversAssets: 'Acciones + Forex + Noticias',
      freeLimit: '60 req/min',
      color: 'text-cyan-400',
    },
    {
      name: 'Polygon',
      key: 'POLYGON_API_KEY',
      icon: 'POL',
      description: 'Acciones — backup de Finnhub, snapshots, búsqueda de tickers',
      registerUrl: 'https://polygon.io/',
      isConfigured: marketStatus?.activeProviders?.includes('polygon') ?? false,
      isActive: marketStatus?.activeProviders?.includes('polygon') ?? false,
      coversAssets: 'Acciones',
      freeLimit: '5 req/min',
      color: 'text-blue-400',
    },
    {
      name: 'Alpaca',
      key: 'ALPACA_API_KEY + NEXT_PUBLIC_ALPACA_API_KEY',
      icon: 'ALP',
      description: 'Acciones en tiempo real (SDK oficial) — velas históricas, cotizaciones, broker, WebSocket IEX',
      registerUrl: 'https://app.alpaca.markets/signup',
      isConfigured: !!(process.env.NEXT_PUBLIC_ALPACA_API_KEY && process.env.NEXT_PUBLIC_ALPACA_API_SECRET),
      isActive: marketStatus?.activeProviders?.includes('alpaca') ?? !!(process.env.NEXT_PUBLIC_ALPACA_API_KEY && process.env.NEXT_PUBLIC_ALPACA_API_SECRET),
      coversAssets: 'Acciones REST + WS + Broker',
      freeLimit: '200 req/min + IEX WS gratis',
      color: 'text-purple-400',
    },
    {
      name: 'FRED',
      key: 'FRED_API_KEY',
      icon: 'FRED',
      description: 'Datos macroeconómicos — tasa Fed, CPI, desempleo, PIB, VIX',
      registerUrl: 'https://fred.stlouisfed.org/docs/api/api_key.html',
      isConfigured: false,
      isActive: false,
      coversAssets: 'Macro',
      freeLimit: '120 req/min',
      color: 'text-orange-400',
    },
  ];

  const configuredCount = providers.filter(p => p.isConfigured).length;
  const totalProviders = providers.length;
  const hasRealStockData = providers.some(p => (p.name === 'Alpaca' || p.name === 'Finnhub') && p.isActive);

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-gray-300">Fuentes de Datos</span>
          <Badge className={`text-[8px] border-0 ${
            configuredCount >= 3 ? 'bg-emerald-500/15 text-emerald-400' :
            configuredCount >= 2 ? 'bg-yellow-500/15 text-yellow-400' :
            'bg-red-500/15 text-red-400'
          } px-1.5`}>
            {configuredCount}/{totalProviders} activas
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {!hasRealStockData && (
            <Badge className="text-[8px] border-0 bg-red-500/15 text-red-400 px-1.5">
              Acciones SIMULADAS
            </Badge>
          )}
          {hasRealStockData && (
            <Badge className="text-[8px] border-0 bg-emerald-500/15 text-emerald-400 px-1.5">
              Datos REALES
            </Badge>
          )}
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
          {/* Summary */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-white/5">
            {marketStatus?.isRealData ? (
              <Wifi className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className="text-[10px] font-medium text-gray-300">
                {marketStatus?.isRealData
                  ? 'Datos de mercado reales activos'
                  : 'Datos simulados — configura API keys para datos reales'}
              </p>
              <p className="text-[9px] text-gray-500">
                Crypto funciona con datos reales sin claves. Acciones requieren Alpaca (recomendado) o Finnhub.
              </p>
            </div>
          </div>

          {/* Provider List */}
          <div className="space-y-1.5">
            {providers.map(provider => (
              <div key={provider.name}
                className={`flex items-start gap-2 p-2 rounded-md border ${
                  provider.isActive
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : provider.isConfigured
                    ? 'border-yellow-500/20 bg-yellow-500/5'
                    : 'border-white/5 bg-white/[0.02]'
                }`}
              >
                {/* Status Icon */}
                <div className="mt-0.5 flex-shrink-0">
                  {provider.isActive ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-gray-600" />
                  )}
                </div>

                {/* Provider Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-bold ${provider.color}`}>{provider.icon}</span>
                    <span className="text-[10px] font-semibold text-white">{provider.name}</span>
                    <Badge className={`text-[7px] border-0 px-1 ${
                      provider.isActive ? 'bg-emerald-500/15 text-emerald-400' :
                      'bg-white/5 text-gray-500'
                    }`}>
                      {provider.isActive ? 'ACTIVO' : 'INACTIVO'}
                    </Badge>
                  </div>
                  <p className="text-[9px] text-gray-400 mt-0.5">{provider.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[8px] text-gray-500">Cubre: {provider.coversAssets}</span>
                    <span className="text-[8px] text-gray-500">Limite: {provider.freeLimit}</span>
                  </div>
                  {!provider.isConfigured && provider.key !== '(sin clave)' && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <code className="text-[8px] px-1.5 py-0.5 rounded bg-black/30 text-amber-300 border border-amber-500/20">
                        {provider.key}
                      </code>
                      {provider.registerUrl && (
                        <a href={provider.registerUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-[8px] text-cyan-400 hover:text-cyan-300">
                          Registrar <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Instructions */}
          {!hasRealStockData && (
            <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-semibold text-amber-300">Como activar datos reales</span>
              </div>
              <ol className="text-[9px] text-amber-200/80 space-y-1 ml-4 list-decimal">
                <li>Registrate en <a href="https://app.alpaca.markets/signup" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">Alpaca</a> (gratis) — datos de acciones en tiempo real + broker</li>
                <li>Ve al dashboard → API Keys → Generate New Keys</li>
                <li>Copia el <strong>API Key ID</strong> (PK...) y el <strong>Secret Key</strong></li>
                <li>Agrega en Vercel o .env:
                  <code className="block mt-0.5 px-1 bg-black/30 rounded text-amber-300 text-[8px]">ALPACA_API_KEY=PK_tu_key</code>
                  <code className="block mt-0.5 px-1 bg-black/30 rounded text-amber-300 text-[8px]">ALPACA_API_SECRET=tu_secret</code>
                  <code className="block mt-0.5 px-1 bg-black/30 rounded text-amber-300 text-[8px]">NEXT_PUBLIC_ALPACA_API_KEY=PK_tu_key</code>
                  <code className="block mt-0.5 px-1 bg-black/30 rounded text-amber-300 text-[8px]">NEXT_PUBLIC_ALPACA_API_SECRET=tu_secret</code>
                </li>
                <li>Opcional: Tambien registra en <a href="https://finnhub.io/register" target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline">Finnhub</a> como backup</li>
                <li>Reinicia la aplicacion</li>
              </ol>
            </div>
          )}

          {/* Refresh Button */}
          {onRefresh && (
            <Button size="sm" variant="ghost" className="w-full h-7 text-[9px] text-gray-400 hover:text-gray-300"
              onClick={onRefresh}>
              <RefreshCw className="w-3 h-3 mr-1" />
              Refrescar estado
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
