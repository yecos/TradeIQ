# TradeIQ - Plataforma de Trading Semi-Automática con IA

Plataforma de análisis multivector de mercados financieros con motor de confluencia inteligente. Selecciona los vectores de análisis que quieras, obtén señales con entradas, Stop Loss y Take Profit, y ejecuta tú mismo.

![TradeIQ Dashboard](https://img.shields.io/badge/Status-Beta-green) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## 🎯 Qué hace TradeIQ

1. **Selecciona un símbolo** (AAPL, NVDA, TSLA...) de la watchlist
2. **Activa los vectores** que quieras usar (técnicos, patrones, volumen, noticias, sentimiento, macro)
3. **Ejecuta el análisis** → el motor de confluencia combina todos los vectores
4. **Revisa la señal** → dirección (LONG/SHORT), entrada, SL, TP, Riesgo:Beneficio
5. **Tú decides si ejecutas** → es semi-automático, tú tienes el control

## 🔬 6 Vectores de Análisis

| Vector | Qué analiza | Estado |
|--------|------------|--------|
| 🟢 **Indicadores Técnicos** | RSI, MACD, Bollinger Bands, EMA 20/50, ADX, ATR | ✅ Funcional |
| 🟡 **Patrones de Vela** | Doji, Hammer, Engulfing, Morning/Evening Star, Pin Bar, 3 Soldiers/Crows | ✅ Funcional |
| 🟣 **Análisis de Volumen** | Volume Profile, OBV, Acumulación/Distribución | ✅ Funcional |
| 🔴 **Análisis de Noticias** | Sentimiento de noticias con IA | 🔧 Simulado (preparado para API) |
| 💜 **Sentimiento de Mercado** | Fear & Greed Index, sentimiento social | 🔧 Simulado (preparado para API) |
| 🔵 **Análisis Macro** | Fed, calendario económico, tasas | 🔧 Simulado (preparado para API) |

## 🤖 Motor de Confluencia

Combina las señales de todos los vectores activos y genera:

- **Dirección**: LONG / SHORT / NEUTRAL
- **Score de confluencia**: 0-100% (qué tan de acuerdo están los vectores)
- **Entrada sugerida**: Precio de entrada
- **Stop Loss**: Nivel de corte de pérdidas
- **Take Profit**: Objetivo de ganancias
- **Riesgo:Beneficio**: Ratio R:R
- **Recomendación**: Texto explicativo

## 🛠️ Tech Stack

- **Framework**: Next.js 16 + TypeScript
- **Chart**: lightweight-charts v5 (TradingView)
- **UI**: Tailwind CSS + shadcn/ui
- **Database**: Prisma ORM + SQLite
- **State**: Zustand + TanStack Query
- **Broker**: Alpaca Markets (paper trading)

## 🚀 Quick Start

```bash
# Clonar
git clone https://github.com/yecos/TradeIQ.git
cd TradeIQ

# Instalar dependencias
bun install

# Configurar variables de entorno
cp .env.example .env.local

# Inicializar base de datos
bun run db:push

# Ejecutar en desarrollo
bun run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## 📋 Variables de Entorno

Ver `.env.example` para la lista completa:

| Variable | Para qué | Dónde conseguirla |
|----------|---------|-------------------|
| `DATABASE_URL` | Base de datos SQLite | Ya configurada |
| `ALPACA_API_KEY` | Conexión al broker | [alpaca.markets](https://alpaca.markets) |
| `ALPACA_API_SECRET` | Conexión al broker | [alpaca.markets](https://alpaca.markets) |
| `POLYGON_API_KEY` | Datos de mercado en tiempo real | [polygon.io](https://polygon.io) |

## 📁 Estructura del Proyecto

```
src/
├── app/
│   ├── api/
│   │   ├── analyze/       # Motor de análisis multivector
│   │   ├── broker/        # Configuración del broker
│   │   ├── journal/       # Bitácora de operaciones
│   │   ├── market/        # Datos de mercado (candles, quotes)
│   │   ├── signals/       # Señales generadas
│   │   └── watchlist/     # Watchlist CRUD
│   ├── layout.tsx
│   ├── page.tsx           # Dashboard principal
│   └── globals.css
├── components/
│   ├── trading/
│   │   ├── trading-chart.tsx    # Gráfico de velas
│   │   ├── vector-panel.tsx     # Selector de vectores
│   │   ├── analysis-panel.tsx   # Panel de análisis detallado
│   │   ├── signal-card.tsx      # Tarjeta de señal
│   │   ├── watchlist-panel.tsx  # Watchlist lateral
│   │   ├── journal-panel.tsx    # Bitácora de trades
│   │   └── broker-panel.tsx     # Conexión al broker
│   └── ui/                      # shadcn/ui components
├── lib/
│   ├── types.ts                 # TypeScript types
│   ├── market-data.ts           # Datos de mercado
│   ├── technical-analysis.ts    # RSI, MACD, Bollinger, EMA, ADX, ATR
│   ├── pattern-detection.ts     # Patrones de vela japonesa
│   ├── volume-analysis.ts       # Análisis de volumen
│   ├── confluence-engine.ts     # Motor de confluencia
│   ├── vector-definitions.ts    # Definición de vectores
│   └── store.ts                 # Zustand store
└── prisma/
    └── schema.prisma            # Modelos de base de datos
```

## 🗺️ Roadmap

- [ ] **Datos reales** → Conectar Polygon.io para precios en tiempo real
- [ ] **Broker real** → Integrar Alpaca Trading API para paper trading
- [ ] **Backtesting** → Validar estrategias con datos históricos
- [ ] **IA para noticias** → z-ai-web-dev-sdk para análisis de sentimiento real
- [ ] **Alertas** → Notificaciones cuando confluencia > 70%
- [ ] **Multi-timeframe** → Analizar 5min + 1hora + 1 día
- [ ] **Order flow** → Book de órdenes y liquidez institucional
- [ ] **Risk Management** → Cálculo de tamaño de posición

## ⚠️ Disclaimer

TradeIQ es una herramienta de análisis educativa. **No constituye asesoría financiera.** Los datos actuales son simulados. Opera con dinero real solo si entiendes los riesgos. Siempre usa Stop Loss y gestión de riesgo.

## 📄 Licencia

MIT
