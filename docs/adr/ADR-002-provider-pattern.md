# ADR-002: Provider Pattern para fuentes de datos

## Estado: Aceptado

## Contexto
TradeIQ actualmente usa datos simulados (mock) pero necesita migrar a datos reales (Polygon.io/Alpaca). Los componentes y API routes no deben saber si los datos son reales o simulados.

## Decisión
Implementar el Provider Pattern: definir una interfaz `MarketDataProvider` que abstraiga la fuente de datos. Los componentes usan la interfaz, no la implementación concreta.

```typescript
interface MarketDataProvider {
  getCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;
  getQuote(symbol: string): Promise<Quote>;
  searchSymbols(query: string): Promise<Symbol[]>;
}
```

Implementaciones:
- `MockMarketProvider` - datos simulados (desarrollo)
- `PolygonProvider` - datos reales via Polygon.io (producción)
- `AlpacaProvider` - datos reales via Alpaca (alternativa)

## Consecuencias
### Positivas
- Cambiar de mock a real sin tocar componentes
- Facilidad para testing con providers de prueba
- Se pueden tener múltiples fuentes de datos
- Los componentes son agnósticos a la fuente

### Negativas
- Capa adicional de abstracción
- Necesidad de mantener la interfaz sincronizada con las capacidades reales
