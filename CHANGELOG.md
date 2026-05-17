# TradeIQ - Changelog

Todos los cambios notables al proyecto se documentan aquí.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

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
