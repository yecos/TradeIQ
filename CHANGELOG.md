# TradeIQ - Changelog

Todos los cambios notables al proyecto se documentan aquí.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

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
