# ADR-005: Motor de Confluencia con pesos configurables

## Estado: Aceptado

## Contexto
TradeIQ combina señales de múltiples vectores de análisis. Se necesita un mecanismo que determine la dirección y fuerza de la señal combinada.

## Decisión
Usar un motor de confluencia donde cada vector tiene:
- `strength` (0-100): Fuerza de la señal del vector
- `confidence` (0-100): Confianza en la señal
- `weight` (configurable): Peso del vector en la confluencia total

La confluencia se calcula como:
```
longScore = Σ(vector.strength × vector.confidence × vector.weight) para señales LONG
shortScore = Σ(vector.strength × vector.confidence × vector.weight) para señales SHORT
confluenceScore = |longScore - shortScore| / (longScore + shortScore) × 100
```

## Consecuencias
### Positivas
- El usuario puede dar más peso a vectores que confía más
- Transparente: se puede ver exactamente qué vectores contribuyeron
- Fácil de agregar nuevos vectores

### Negativas
- La fórmula asume independencia entre vectores (no siempre cierto)
- Los pesos por defecto pueden no ser óptimos
- Necesita backtesting para validar la efectividad
