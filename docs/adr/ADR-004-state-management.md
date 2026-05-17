# ADR-004: Zustand + TanStack Query para estado

## Estado: Aceptado

## Contexto
TradeIQ necesita manejar estado global del cliente (símbolo seleccionado, vectores activos) y estado del servidor (datos de mercado, señales, análisis).

## Decisión
- **Zustand** para estado global del cliente (UI state, preferencias)
- **TanStack Query** para estado del servidor (candles, quotes, analysis, signals)

No usar Context API ni Redux.

## Consecuencias
### Positivas
- Zustand es ligero (1KB) y sin boilerplate
- TanStack Query maneja cache, refetch, loading states automáticamente
- Separación clara: cliente vs servidor
- No hay prop drilling

### Negativas
- Dos librerías de estado diferentes
- Curva de aprendizaje para TanStack Query
