# ADR-003: lightweight-charts v5 para visualización

## Estado: Aceptado

## Contexto
TradeIQ necesita un gráfico de velas interactivo para visualizar datos de mercado. Las opciones principales eran: lightweight-charts (TradingView), D3.js, y canvas nativo.

## Decisión
Usar lightweight-charts v5 de TradingView como librería de gráficos.

## Consecuencias
### Positivas
- Gráficos financieros profesionales out-of-the-box
- API específica para trading (candlestick, volume, indicators)
- Rendimiento optimizado para series temporales grandes
- Mantenido por TradingView (empresa líder en charts financieros)
- Soporte nativo para overlays de indicadores técnicos

### Negativas
- Menos flexible que D3.js para visualizaciones custom
- Dependencia de una librería de terceros
- Actualización de v4 a v5 tuvo breaking changes
- Documentación limitada comparada con D3
