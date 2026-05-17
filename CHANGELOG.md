# TradeIQ - Changelog

Todos los cambios notables al proyecto se documentan aquí.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

---

## [0.16.0] - 2026-05-18

### Agregado
- **FEATURE**: Dashboard de Portafolio con equity curve y métricas (`src/components/trading/portfolio-panel.tsx`)
  - Portfolio Summary Card: equity, daily P&L, total P&L, unrealized P&L
  - SVG sparkline que refleja tendencia (alcista/bajista/mixta) basada en P&L
  - Win Rate circular indicator con color coding (≥60% verde, ≥40% amarillo, <40% rojo)
  - Métricas: Profit Factor, Total Trades, Ganancia/Pérdida Prom., Best/Worst Trade
  - Racha actual con iconos (Award para wins, XCircle para losses)
  - Duración promedio de trades (horas o días)
  - Lista de posiciones abiertas con P&L no realizado ($ y %)
  - Botón "Cerrar" por posición (DELETE /api/broker/positions)
  - Empty states: sin broker, sin posiciones, error con retry
  - Skeleton loading animation
- **FEATURE**: Hook `usePortfolio` (`src/hooks/use-portfolio.ts`)
  - TanStack Query: fetch de /api/broker/portfolio cada 30s
  - Solo activo cuando broker está conectado
  - Tipos exportados: PortfolioSnapshot, PortfolioPosition, PortfolioMetrics, PortfolioData
- **FEATURE**: API `/api/broker/portfolio` mejorada
  - Ahora incluye `equityHistory` en la respuesta (para equity curve)
  - Snapshot + positions + metrics + equityHistory
- **FEATURE**: Tab "Portafolio" agregado al dashboard (icono Wallet)
  - Pasa `brokerConnected` prop al PortfolioPanel
- **FEATURE**: 22 nuevos tests de portfolio (261 total)
  - P&L calculations: daily/total percentage, negative, zero equity
  - Metric formatting: equity locale, win rate, profit factor (Infinity), duration
  - Win rate circle SVG stroke-dasharray calculation
  - Sparkline trend detection: uptrend, downtrend, mixed
  - Portfolio snapshot interface validation
  - Performance metrics edge cases: zero trades, all wins, all losses
  - Position side badge identification

### Cambios
- **CHANGE**: page.tsx agrega tab "Portafolio" con Wallet icon
- **CHANGE**: /api/broker/portfolio ahora retorna equityHistory además de snapshot/positions/metrics

---

## [0.15.0] - 2026-05-18

### Agregado
- **FEATURE**: Autenticación con NextAuth (`src/lib/auth.ts`)
  - Credentials provider (email + contraseña)
  - bcrypt password hashing (12 salt rounds)
  - JWT sessions con expiración de 24h
  - Type augmentation para session.user.id
  - `hashPassword()` y `verifyPassword()` para gestión de contraseñas
- **FEATURE**: Modelos de NextAuth en Prisma (User, Account, Session, VerificationToken)
  - PrismaAdapter para persistencia de usuarios
  - Campo `hashedPassword` en modelo User
  - Relaciones User → Account, User → Session con cascade delete
- **FEATURE**: Prisma Client Singleton (`src/lib/prisma.ts`)
  - Previene múltiples conexiones en desarrollo (hot reload)
  - Logging configurado por ambiente
- **FEATURE**: API de Registro (`POST /api/auth/register`)
  - Validación de email y contraseña (mínimo 8 caracteres)
  - Detección de emails duplicados (sin revelar existencia)
  - Auto-login después de registro
- **FEATURE**: Página de Login (`/login`)
  - Toggle Login / Crear Cuenta
  - Validación de formularios
  - Toggle mostrar/ocultar contraseña
  - Mensajes de error claros
  - Diseño oscuro profesional consistente con la app
- **FEATURE**: Middleware con protección de rutas por autenticación
  - Rutas protegidas: `/api/trade/*`, `/api/broker/*`
  - Rutas protegidas (POST): `/api/signals`, `/api/journal`
  - Rutas públicas: `/api/auth/*`, `/api/market/*`
  - `x-user-id` header inyectado para API routes downstream
- **FEATURE**: SessionProvider en Providers wrapper
- **FEATURE**: 16 nuevos tests de autenticación (239 total)
  - Password hashing: hash, salt uniqueness, empty strings
  - Password verification: correct, incorrect, case sensitivity
  - Password security: special chars, unicode, very long
  - Auth config: structure, JWT strategy, credentials provider, session max age
  - Registration validation: email format, minimum password length

### Cambios
- **CHANGE**: Prisma schema actualizado con modelos User, Account, Session, VerificationToken
- **CHANGE**: Señal y JournalEntry ahora tienen campo `userId` para vincular a usuario
- **CHANGE**: BrokerConfig ahora tiene campo `userId` para vincular a usuario
- **CHANGE**: middleware.ts ahora verifica JWT token en rutas protegidas
- **CHANGE**: Providers.tsx ahora incluye SessionProvider de next-auth
- **CHANGE**: .env actualizado con NEXTAUTH_SECRET y NEXTAUTH_URL

---

## [0.14.0] - 2026-05-18

### Agregado
- **FEATURE**: WebSocket en tiempo real con Binance Kline Stream (`src/lib/data/binance-ws.ts`)
  - Conexión automática a `wss://stream.binance.com:9443/ws/{symbol}@kline_{interval}`
  - Actualizaciones cada 1-2 segundos (velas que se mueven en vivo como TradingView)
  - Auto-reconnect con exponential backoff (1s → 2s → 4s → 8s → max 30s)
  - Fallback automático entre binance.com y binance.us
  - Connection timeout (10s) y dead connection detection (60s sin mensajes)
  - `isWSCompatible()` para detectar símbolos crypto compatibles
  - Singleton pattern con `getBinanceWS()` / `disposeBinanceWS()`
  - State tracking: disconnected → connecting → connected → reconnecting
  - Latency tracking basado en event timestamp vs local time
- **FEATURE**: React Hook `useRealtimeCandles` (`src/hooks/use-realtime-candles.ts`)
  - Merge automático: velas históricas REST + updates WebSocket en tiempo real
  - Actualiza última vela (misma timeframe) o agrega nueva vela (nuevo período)
  - Preserva High máximo y Low mínimo de la vela formándose
  - Solo activa para símbolos crypto (stocks/ETFs usan polling normal)
- **FEATURE**: TradingChart mejorado con actualización incremental
  - `update()` de lightweight-charts para animación suave sin re-render completo
  - Indicador "LIVE" con ping animado sobre el gráfico cuando WS está conectado
  - Indicador "CONECTANDO" cuando WS está estableciendo conexión
  - Auto-scroll inteligente: mantiene visible la última vela solo si usuario está cerca
- **FEATURE**: Indicador WebSocket en header
  - Badge "WS" con dot animado verde cuando hay conexión en tiempo real
  - Latencia en ms mostrada al lado del indicador
  - Reduce polling REST automáticamente cuando WS está activo (15s → 60s quotes, 10s → 300s candles)
- **FEATURE**: 24 nuevos tests (223 total)
  - Tests de BinanceKlineWS: compatibilidad, estado, singleton, dispose, subscripciones
  - Tests de Candle Merging: merge de vela formándose, nueva vela, vela antigua, actualizaciones rápidas

### Cambios
- **CHANGE**: TradingChart ahora acepta props `timeframe` y `onWSStateChange`
- **CHANGE**: page.tsx pasa `timeframe` al componente TradingChart
- **CHANGE**: page.tsx muestra indicador WS en el header con ping animado
- **CHANGE**: TanStack Query refetchInterval reducido cuando WebSocket está activo

---

## [0.13.0] - 2026-05-18

### Agregado
- **FEATURE**: AES-256-GCM Encryption para API keys (`src/lib/crypto.ts`)
  - Encripta API keys antes de guardarlas en la base de datos
  - Scrypt key derivation desde ENCRYPTION_KEY env variable
  - Random IV + salt por encriptación (misma clave → diferente ciphertext)
  - Authentication tag detecta manipulación de datos
  - `isEncrypted()` para detectar si un valor está encriptado
  - `generateSecureToken()` para tokens aleatorios seguros
- **FEATURE**: Middleware de seguridad (`middleware.ts`)
  - Rate limiting: 60 requests/min por IP (in-memory)
  - Security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy
  - Protección de endpoints de trade execution
  - Request logging
- **FEATURE**: API keys encriptadas en base de datos
  - broker/route.ts encripta apiKey y apiSecret antes de guardar
  - Desencripta solo cuando necesita conectar al broker
  - Nunca expone keys completas al frontend (mask: `***last4`)
- **FEATURE**: 15 nuevos tests de crypto (199 total)

### Cambios
- **CHANGE**: broker/route.ts ahora encripta/desencripta API keys con AES-256-GCM
- **CHANGE**: broker/route.ts retorna keys enmascaradas al frontend (sin texto plano)

---

## [0.12.0] - 2026-05-18

### Agregado
- **FEATURE**: Position Tracker — seguimiento de posiciones, P&L y métricas de rendimiento
  - `src/lib/broker/position-tracker.ts` — Tracker con portfolio snapshot, closed trades, performance metrics
  - Portfolio snapshot: equity, unrealized/realized P&L, daily P&L, position count
  - Closed trade recording con: entry/exit price, P&L, duración, side
  - Performance metrics: win rate, profit factor, avg win/loss, best/worst trade, streak, avg duration
  - Equity history (max 1440 puntos = 24h a 1-min intervalos)
  - Daily P&L reset para tracking diario
- **FEATURE**: API endpoint `GET /api/broker/portfolio` — snapshot + posiciones + métricas
- **FEATURE**: 16 nuevos tests de PositionTracker (184 total)

---

## [0.11.0] - 2026-05-18

### Agregado
- **FEATURE**: Order Manager — ciclo de vida completo de ejecución de trades
  - `src/lib/broker/order-manager.ts` — Orquesta: ConfluenceResult → RiskEngine → BrokerProvider
  - Flujo: assessTrade (pre-flight) → executeTrade (confirmación) → orden al broker
  - Position sizing automático basado en riesgo y distancia al stop
  - BuildAccountSnapshot desde datos reales del broker
  - Configuración de riesgo ajustable en runtime
- **FEATURE**: API endpoints para ejecución de trades
  - `POST /api/trade` — Ejecuta trade con validación de riesgo completa
  - `POST /api/trade/assess` — Pre-flight risk assessment sin ejecutar
- **FEATURE**: SignalCard mejorada con botón "Ejecutar Trade"
  - Botón "Evaluar" → llama assess → muestra preview de riesgo
  - Botón "Confirmar" → ejecuta el trade
  - Muestra: posición, valor, riesgo $, riesgo %, warnings
  - Deshabilitado si no hay broker conectado
- **FEATURE**: 18 nuevos tests de OrderManager (168 total)

### Cambios
- **CHANGE**: SignalCard ahora acepta prop `brokerConnected` para habilitar ejecución
- **CHANGE**: page.tsx pasa `brokerConfig?.isActive` a SignalCard

---

## [0.10.0] - 2026-05-18

### Agregado
- **FEATURE**: Broker Integration — Provider Pattern para operaciones de broker (ADR-002)
  - `src/lib/broker/broker-interface.ts` — Interfaz genérica `BrokerProvider` con tipos: BrokerAccount, BrokerPosition, BrokerOrder, OrderRequest, ConnectionTestResult
  - `src/lib/broker/alpaca-broker.ts` — Implementación completa de Alpaca Markets API (paper + live)
    - Autenticación con API Key + Secret
    - Operaciones: getAccount, getPositions, submitOrder, cancelOrder, closePosition, closePositionPartial
    - Timeout de 10s por request, manejo de errores HTTP (401, 403, 404, 429)
    - Mapeo automático de respuestas Alpaca a tipos internos
  - `src/lib/broker/mock-broker.ts` — Broker simulado para testing y fallback
    - Simula órdenes market (fill inmediato) y limit (pendiente)
    - Actualiza posiciones automáticamente al ejecutar órdenes
    - Helpers de test: setPositions, setAccount, reset
  - `src/lib/broker/broker-factory.ts` — Factory singleton con auto-fallback a MockBroker
    - `initBroker(apiKey, apiSecret, isPaper)` → testConnection antes de aceptar
    - `resetBroker()` → desconecta y vuelve a MockBroker
- **FEATURE**: API endpoints de broker
  - `GET /api/broker` — Retorna config + account info + positions + connection status
  - `POST /api/broker` — Conecta/desconecta broker con testConnection automático
  - `GET /api/broker/orders` — Lista órdenes (filtro por status)
  - `POST /api/broker/orders` — Envía orden con validación completa
  - `GET /api/broker/positions` — Lista posiciones (filtro por símbolo)
  - `DELETE /api/broker/positions?symbol=X&qty=Y` — Cierra posición (total o parcial)
- **FEATURE**: BrokerPanel rediseñado con datos reales
  - Muestra equity, cash, buying power, market value de la cuenta
  - Lista de posiciones con P&L no realizado y botón "Cerrar"
  - Banner de advertencia LIVE TRADING cuando isPaper=false
  - Auto-refresh cada 30s con TanStack Query
  - Connection test automático al conectar
- **FEATURE**: 26 nuevos tests de broker (150 total)

### Cambios
- **CHANGE**: `broker/route.ts` ahora usa BrokerFactory + testConnection antes de guardar credenciales
- **CHANGE**: BrokerPanel ahora maneja conexión/desconexión internamente con useMutation
- **CHANGE**: page.tsx callbacks saveBrokerConfig/disconnectBroker simplificados (solo actualizan estado local)

---

## [0.9.0] - 2026-05-18

### Agregado
- **FEATURE**: Módulo de validación de datos de mercado (`src/lib/data/validator.ts`)
  - Validación de candles: NaN/Infinity, precios zero/negativos, consistencia OHLC, timestamps futuros, detección de gaps
  - Validación de quotes: precio, volumen, consistencia de change, límites high/low
  - Sanity check de precios por símbolo (rangos conocidos para BTC, ETH, AAPL, etc.)
  - Detección de datos antiguos (stale) por intervalo
  - Limpieza automática de datos inválidos (remueve candles malos, reordena)
- **FEATURE**: Data Quality Report — el SmartProvider rastrea qué símbolos usan mock data y cuáles están stale
  - `getDataQualityReport()` retorna: source, isMockData, isStale, staleSymbols, lastRealDataTime, warnings
  - API `/api/market/status` ahora incluye `dataQuality` con el reporte completo
- **FEATURE**: Banner de advertencia en UI cuando datos son simulados o antiguos
  - Banner rojo: "DATOS SIMULADOS — No operar con dinero real basado en estos datos"
  - Banner amarillo: "DATOS ANTIGUOS — Algunos símbolos tienen datos retrasados"
- **FEATURE**: Campo `isMock` en tipo `Quote` para identificar datos simulados
- **FEATURE**: Tipos `DataQualityReport`, `RiskConfig`, `RiskAssessment`, `AccountSnapshot` en `types.ts`
- **FEATURE**: Risk Management Engine (`src/lib/risk/risk-engine.ts`)
  - 7 reglas de protección: master switch, dirección, equity mínimo, max drawdown, pérdida diaria, posiciones máximas, horario
  - Position sizing automático: método fixed-fractional (riesgo X% / distancia stop = shares)
  - Configuración ajustable en runtime
  - Warnings cuando se acerca a límites (80% drawdown, 70% pérdida diaria)
  - Verificación de R:R mínimo recomendado (1.5)
- **FEATURE**: 46 nuevos tests (27 validación + 19 risk engine, 124 total)

### Cambios
- **CHANGE**: SmartProvider ahora valida todos los candles y quotes antes de retornarlos
- **CHANGE**: SmartProvider rastrea `mockSymbols` y `staleSymbols` automáticamente
- **CHANGE**: API `/api/market/status` expone `dataQuality` reporte completo

---

## [0.8.0] - 2026-05-18

### Agregado
- **FEATURE**: Motor de Backtesting completo para validar estrategias con datos históricos
  - `src/lib/backtest/engine.ts` — Walk-forward engine que simula trades con el motor de confluencia
  - `src/lib/backtest/metrics.ts` — Métricas: Win Rate, Profit Factor, Sharpe Ratio, Max Drawdown, P&L
  - `src/lib/backtest/types.ts` — Tipos: BacktestConfig, BacktestTrade, BacktestResult, EquityPoint
- **FEATURE**: API endpoint `/api/backtest` — Ejecuta backtest con configuración personalizable
- **FEATURE**: Componente `BacktestPanel` — UI completa para configurar y visualizar resultados
  - Selector de vectores, confluencia mínima, capital inicial
  - Grid de métricas clave (P&L, Win Rate, Profit Factor, Drawdown, Sharpe, Trades)
  - Desglose por dirección (LONG vs SHORT), lista de últimos trades
- **FEATURE**: Tab "Backtest" agregado al panel derecho del dashboard
- **FEATURE**: 10 nuevos tests de backtesting (56 total)

### Cambios
- **CHANGE**: page.tsx actualizado con nueva tab "Backtest" y import de BacktestPanel + FlaskConical icon

---

## [0.6.0] - 2026-05-17

### Agregado
- **FEATURE**: Provider Pattern para fuentes de datos de mercado (ADR-002 implementado)
  - `src/lib/data/market-data-interface.ts` — Interfaz `MarketDataProvider` + `DataCache` con TTL
  - `src/lib/data/mock-provider.ts` — Datos simulados (refactorizado de market-data.ts)
  - `src/lib/data/polygon-provider.ts` — Datos reales via Polygon.io REST API
  - `src/lib/data/provider-factory.ts` — Selección automática: Polygon si hay API key, Mock si no
- **FEATURE**: PolygonProvider con rate limiting (5 calls/min), caché con TTL (60s quotes, 5min candles), retry en 429
- **FEATURE**: API endpoint `/api/market/search?q=` para búsqueda de símbolos
- **FEATURE**: 29 nuevos tests (46 total): MockProvider (20), DataCache, Provider Factory (9)
- **FEATURE**: Tipo `SymbolInfo` agregado a types.ts

### Cambios
- **CHANGE**: `src/lib/market-data.ts` convertido a thin wrapper que delega al provider factory
- **CHANGE**: Cero breaking changes — todas las importaciones existentes siguen funcionando
- **CHANGE**: `.env.example` actualizado con instrucciones de Polygon.io
- **CHORE**: Sin `POLYGON_API_KEY` la app funciona idéntica a antes (MockProvider)

---

## [0.5.0] - 2026-05-17

### Agregado
- **FEATURE**: Vitest configurado con 17 tests (technical-analysis, pattern-detection, confluence-engine)
- **FEATURE**: Husky + lint-staged — pre-commit hook que ejecuta lint + tests automáticamente
- **FEATURE**: Scripts de testing: `bun run test`, `bun run test:watch`, `bun run test:coverage`
- **CHORE**: Branch `develop` creada para git strategy (main = estable, develop = desarrollo)
- **CHORE**: Base de datos SQLite inicializada y sincronizada

### Cambios
- **CHANGE**: ESLint ahora es estricto — `no-explicit-any: warn`, `no-unused-vars: warn`, `no-console: warn`, `no-debugger: error`
- **CHANGE**: TypeScript `noImplicitAny: true` (antes era false)
- **CHANGE**: Next.js `ignoreBuildErrors: false` y `reactStrictMode: true` (antes eran false)
- **CHANGE**: package.json nombre cambiado de "nextjs_tailwind_shadcn_ts" a "tradeiq"
- **FIX**: 12 catch blocks con `error` sin usar cambiados a `catch { }`
- **FIX**: Variable `isLoadingChart` sin usar eliminada de page.tsx
- **FIX**: Dependencia innecesaria `symbol` en useCallback de trading-chart.tsx
- **FIX**: Variable `actionTypes` en use-toast.ts convertida de runtime a type-only
- **CHORE**: tailwind.config.ts y generate-tradeiq-doc.js agregados a ESLint ignores

---

## [0.4.0] - 2026-05-17

### Agregado
- **DOCS**: .cursorrules - Reglas auto-cargadas por Cursor IDE
- **DOCS**: CLAUDE.md - Reglas auto-cargadas por Claude Code
- **DOCS**: .github/copilot-instructions.md - Reglas auto-cargadas por GitHub Copilot
- **DOCS**: PROMPT-SHORT.md - Prompt ultracorto para iniciar sesiones de IA (4 líneas)
- **CHANGE**: WORKFLOW.md actualizado a v1.1.0 con sección de Auto-Discovery (sección 0)

### Cambios
- **CHORE**: Sistema de auto-discovery para que la IA encuentre las reglas sin que el usuario las copie manualmente
- **CHORE**: 3 archivos de auto-carga para diferentes herramientas de IA (.cursorrules, CLAUDE.md, copilot-instructions.md)

---

## [0.3.0] - 2026-05-17

### Agregado
- **DOCS**: WORKFLOW.md - Flujo de trabajo completo con reglas de desarrollo con IA
- **DOCS**: PROMPTS.md - Prompt maestro y prompts por feature para sesiones de IA
- **DOCS**: docs/adr/ - 5 Decisiones de Arquitectura (ADR-001 a ADR-005)
  - ADR-001: SQLite → PostgreSQL en producción
  - ADR-002: Provider Pattern para fuentes de datos
  - ADR-003: lightweight-charts v5 para visualización
  - ADR-004: Zustand + TanStack Query para estado
  - ADR-005: Motor de Confluencia con pesos configurables

### Cambios
- **CHORE**: Estructura de directorios escalable definida en WORKFLOW.md (src/lib/data/, src/lib/broker/, src/lib/ai/, src/hooks/)
- **CHORE**: Mapa de dependencias críticas documentado (types.ts, confluence-engine.ts, market-data.ts, schema.prisma)
- **CHORE**: Reglas de seguridad para desarrollo con IA (no overwrite, no breaking interfaces, documentar cambios)

---

## [0.2.0] - 2026-05-17

### Cambios
- **FIX**: Corregido cálculo de RSI (usaba método incorrecto, ahora usa Wilder's smoothing)
- **FIX**: Valores NaN en Bollinger Bands, SMA200 y StochRSI ahora manejan datos insuficientes
- **CHORE**: Limpieza del repositorio - eliminados 428 archivos internos
- **CHORE**: Agregado README.md profesional
- **CHORE**: Agregado .env.example
- **CHORE**: Mejorado .gitignore para despliegue en Vercel
- **DOCS**: Creado documento de Flujo de Trabajo y Arquitectura

---

## [0.1.0] - 2026-05-17

### Agregado
- **FEATURE**: Dashboard de trading con tema oscuro profesional
- **FEATURE**: Gráfico de velas interactivo con lightweight-charts v5
- **FEATURE**: Watchlist con 10 símbolos (NVDA, AAPL, MSFT, GOOGL, AMZN, TSLA, META, SPY, QQQ, AMD)
- **FEATURE**: 6 vectores de análisis configurables (Técnicos, Patrones, Volumen, Noticias, Sentimiento, Macro)
- **FEATURE**: Motor de confluencia que combina señales de todos los vectores
- **FEATURE**: Indicadores técnicos: RSI(14), MACD(12,26,9), Bollinger Bands(20), EMA(20/50), ADX(14), ATR(14)
- **FEATURE**: Detección de patrones de vela: Doji, Hammer, Engulfing, Morning/Evening Star, Pin Bar, 3 Soldiers/Crows
- **FEATURE**: Análisis de volumen: Volume Ratio, OBV, Acumulación/Distribución
- **FEATURE**: Señales con Entrada, Stop Loss, Take Profit y Riesgo:Beneficio
- **FEATURE**: Panel de análisis detallado por vector
- **FEATURE**: Bitácora de trading (journal)
- **FEATURE**: Panel de configuración de broker (Alpaca Markets)
- **FEATURE**: Búsqueda de símbolos
- **FEATURE**: Base de datos SQLite con Prisma ORM (6 modelos)
- **FEATURE**: 7 API endpoints (candles, quote, analyze, signals, journal, watchlist, broker)
- **CONFIG**: Inicialización del proyecto Next.js 16 con TypeScript
- **CONFIG**: Instalación de lightweight-charts, zustand, tanstack-query
