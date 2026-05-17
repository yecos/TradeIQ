# TradeIQ - Flujo de Trabajo de Desarrollo con IA

> **Última actualización**: 2026-05-17
> **Versión**: 1.1.0

---

## 0. Auto-Discovery: Cómo la IA Encuentra Este Archivo

Este proyecto usa múltiples mecanismos para que cualquier herramienta de IA
encuentre y siga las reglas automáticamente:

| Archivo | Herramienta que lo lee | Contenido |
|---------|----------------------|-----------|
| `WORKFLOW.md` | Todas (lectura manual) | Reglas completas + arquitectura |
| `.cursorrules` | Cursor IDE (automático) | Reglas resumidas |
| `CLAUDE.md` | Claude Code (automático) | Reglas resumidas |
| `.github/copilot-instructions.md` | GitHub Copilot (automático) | Reglas resumidas |
| `PROMPTS.md` | Todas (referencia manual) | Prompts detallados por feature |
| `PROMPT-SHORT.md` | Todas (copiar/pegar) | Prompt ultracorto para nueva sesión |

### Para el usuario: Cómo iniciar una sesión con IA

**Opción A (Recomendada)**: Copia el prompt de `PROMPT-SHORT.md` y pégalo al inicio de la conversación. La IA leerá `WORKFLOW.md` automáticamente.

**Opción B (Cursor/Claude Code)**: No necesitas hacer nada. La IA lee `.cursorrules` o `CLAUDE.md` automáticamente.

**Opción C (Con prompt de feature)**: Prompt de `PROMPT-SHORT.md` + prompt específico de `PROMPTS.md` para el feature que quieras trabajar.

---

## 1. Reglas Obligatorias para el Desarrollo con IA

### 1.1 Regla de Solo-Agregación (NO OVERWRITE)

```
NUNCA sobreescribir un archivo existente sin:
  1. Leer el archivo completo primero
  2. Documentar qué se va a cambiar y POR QUÉ
  3. Usar Edit/MultiEdit (ediciones quirúrgicas) en lugar de Write (reescribir todo)
  4. Verificar que los cambios no rompen imports ni dependencias
```

### 1.2 Regla de Verificación Pre-Cambio

Antes de CUALQUIER modificación de código:

1. **Leer** el archivo objetivo completo
2. **Listar** los archivos que dependen de él (imports)
3. **Identificar** funciones/types/exports que otros archivos usan
4. **Documentar** el cambio planificado en la bitácora
5. **Ejecutar** el cambio
6. **Verificar** que no hay errores de compilación (`bun run build` o `bun run lint`)

### 1.3 Regla de Inmutabilidad de Interfaces

```
NUNCA cambiar la firma de una función o tipo exportado sin:
  1. Actualizar TODOS los archivos que la usan
  2. Documentar el cambio de API en CHANGELOG.md
  3. Marcar la versión anterior como @deprecated si es un cambio breaking
```

### 1.4 Regla de Testing Post-Cambio

Después de cada cambio funcional:

1. Verificar que `bun run lint` pasa sin errores
2. Si es una API route, probar el endpoint manualmente
3. Si es un componente, verificar que renderiza sin errores
4. Documentar el resultado en la bitácora

---

## 2. Sistema de Bitácora (CHANGELOG)

### 2.1 Formato de Entrada

Cada cambio se registra en `CHANGELOG.md` siguiendo [Keep a Changelog](https://keepachangelog.com/es/1.1.0/):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Agregado
- **FEATURE**: Descripción del nuevo feature

### Cambios
- **CHANGE**: Qué se cambió y por qué

### Corregido
- **FIX**: Qué se corrigió

### Eliminado
- **REMOVE**: Qué se eliminó y por qué
```

### 2.2 Versionado Semántico

- **PATCH (0.0.X)**: Bug fixes, correcciones menores
- **MINOR (0.X.0)**: Nuevas funcionalidades, cambios no-breaking
- **MAJOR (X.0.0)**: Cambios breaking en la API o arquitectura

### 2.3 Registro Obligatorio

**NINGÚN cambio de código puede hacerse sin su entrada correspondiente en CHANGELOG.md.**

---

## 3. Estructura de Directorios y Arquitectura Escalable

### 3.1 Arquitectura por Capas

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes (Controllers)
│   │   ├── analyze/              # Motor de análisis
│   │   ├── broker/               # Integración broker
│   │   ├── journal/              # Bitácora de trades
│   │   ├── market/               # Datos de mercado
│   │   ├── signals/              # Señales
│   │   └── watchlist/            # Watchlist
│   ├── (dashboard)/              # Route group para dashboard
│   │   └── page.tsx
│   └── layout.tsx
├── components/
│   ├── trading/                  # Componentes específicos de trading
│   └── ui/                       # shadcn/ui (NO MODIFICAR directamente)
├── lib/
│   ├── analysis/                 # Motores de análisis (core business logic)
│   │   ├── technical-analysis.ts
│   │   ├── pattern-detection.ts
│   │   ├── volume-analysis.ts
│   │   └── confluence-engine.ts
│   ├── data/                     # Fuentes de datos (abstracción)
│   │   ├── market-data.ts        # Provider de datos actual
│   │   ├── polygon-provider.ts   # [FUTURO] Datos reales Polygon.io
│   │   └── alpaca-provider.ts    # [FUTURO] Datos + trading Alpaca
│   ├── broker/                   # Integración con brokers (abstracción)
│   │   ├── broker-interface.ts   # [FUTURO] Interfaz genérica
│   │   └── alpaca-broker.ts      # [FUTURO] Implementación Alpaca
│   ├── ai/                       # Servicios de IA
│   │   ├── news-analyzer.ts      # [FUTURO] Análisis de noticias con IA
│   │   └── sentiment-analyzer.ts # [FUTURO] Análisis de sentimiento
│   ├── types.ts                  # Tipos compartidos
│   ├── store.ts                  # Zustand store
│   └── utils.ts                  # Utilidades
└── hooks/                        # Custom React hooks
    ├── use-market-data.ts        # [FUTURO] Hook para datos en tiempo real
    └── use-websocket.ts          # [FUTURO] Hook para WebSocket
```

### 3.2 Principios de Escalabilidad

1. **Separación de Responsabilidades**: Cada archivo tiene UNA responsabilidad
2. **Inversión de Dependencias**: Los componentes dependen de interfaces, no implementaciones
3. **Provider Pattern**: Datos de mercado y broker se abstraen detrás de interfaces
4. **Feature Flags**: Nuevos features se pueden activar/desactivar con flags
5. **Composición sobre Herencia**: Componentes React compuestos, no anidados

### 3.3 Regla de Abstracción de Datos

```
NUNCA acceder a una API externa directamente desde un componente o API route.
SIEMPRE usar un provider/adapter que abstraiga la fuente de datos.

Ejemplo:
  ❌ fetch('https://api.polygon.io/...') en page.tsx
  ✅ marketDataProvider.getCandles(symbol) → puede ser mock o real
```

---

## 4. Decisiones de Arquitectura (ADRs)

Las decisiones importantes se documentan en `/docs/adr/`:

- **ADR-001**: SQLite para prototipo, migrar a PostgreSQL en producción
- **ADR-002**: Provider pattern para datos de mercado (fácil swap mock→real)
- **ADR-003**: lightweight-charts v5 por rendimiento vs D3.js
- **ADR-004**: Zustand para estado global + TanStack Query para server state
- **ADR-005**: Motor de confluencia con pesos configurables por vector

Cada ADR sigue el formato:

```markdown
# ADR-XXX: Título

## Estado: Aceptado / Deprecated / Superseded

## Contexto
Por qué se necesitaba tomar esta decisión

## Decisión
Qué se decidió

## Consecuencias
Positivas y negativas de la decisión
```

---

## 5. Flujo de Trabajo por Sesión de IA

### 5.1 Inicio de Sesión

Al iniciar una nueva sesión de desarrollo con IA:

1. **IA lee** `WORKFLOW.md` para conocer las reglas
2. **IA lee** `CHANGELOG.md` para saber el estado actual
3. **IA lee** `worklog.md` para entender qué se ha hecho antes
4. **IA lee** los archivos relevantes al feature/fix solicitado
5. **IA presenta** un plan de acción antes de escribir código

### 5.2 Durante la Sesión

1. **Antes de cada cambio**: Leer archivo → Documentar intención → Ejecutar
2. **Después de cada cambio**: Verificar lint → Actualizar CHANGELOG → Registrar en worklog
3. **Nunca**: Reescribir archivos completos si se puede editar quirúrgicamente
4. **Nunca**: Cambiar types/interfaces sin actualizar todos los dependientes

### 5.3 Fin de Sesión

1. Verificar que todo compila (`bun run lint`)
2. Actualizar `CHANGELOG.md` con la versión correspondiente
3. Actualizar `worklog.md` con el resumen de la sesión
4. Si hay cambios breaking, documentar en ADR

---

## 6. Git Strategy

### 6.1 Branching

```
main          → Código estable, listo para despliegue
├── develop   → Desarrollo activo
│   ├── feature/real-market-data    → Feature branch
│   ├── feature/backtesting         → Feature branch
│   ├── feature/ai-news-analysis    → Feature branch
│   └── fix/nan-indicators          → Bug fix branch
```

### 6.2 Commits

Formato: `tipo(scope): descripción`

Tipos:
- `feat(analysis)`: Nuevo feature
- `fix(chart)`: Bug fix
- `refactor(engine)`: Refactor sin cambio funcional
- `docs(readme)`: Solo documentación
- `chore(deps)`: Mantenimiento

### 6.3 Checklist Pre-Merge

- [ ] Lint pasa sin errores
- [ ] CHANGELOG.md actualizado
- [ ] No hay console.log() olvidados
- [ ] No hay hardcoded API keys
- [ ] Tipos TypeScript correctos (no `any` sin justificación)
- [ ] Componentes renderizan correctamente

---

## 7. Mapa de Dependencias Críticas

### 7.1 Archivos Core (NO modificar sin extremo cuidado)

| Archivo | Dependen de él | Riesgo |
|---------|---------------|--------|
| `src/lib/types.ts` | TODOS los archivos de analysis, API routes, componentes | 🔴 CRÍTICO |
| `src/lib/confluence-engine.ts` | API analyze, signal-card, analysis-panel | 🔴 CRÍTICO |
| `src/lib/market-data.ts` | API candles, API quote, API analyze | 🟡 ALTO |
| `prisma/schema.prisma` | Todas las API routes, lib/db.ts | 🟡 ALTO |

### 7.2 Regla de Modificación de Archivos Críticos

```
Si necesitas modificar types.ts o confluence-engine.ts:
  1. Documentar TODOS los archivos afectados
  2. Hacer los cambios de forma backward-compatible
  3. Actualizar TODOS los archivos dependientes en la misma sesión
  4. Verificar lint después de CADA archivo modificado
```

---

## 8. Roadmap de Features con Prioridad

| # | Feature | Estado | Impacto | Complejidad |
|---|---------|--------|---------|-------------|
| 1 | Datos reales (Polygon.io) | 🔧 Pendiente | 🔴 Crítico | 🟡 Media |
| 2 | Backtesting | 🔧 Pendiente | 🔴 Alto | 🔴 Alta |
| 3 | IA para noticias (z-ai-web-dev-sdk) | 🔧 Pendiente | 🟡 Alto | 🟡 Media |
| 4 | Broker real (Alpaca) | 🔧 Pendiente | 🔴 Crítico | 🟡 Media |
| 5 | WebSocket tiempo real | 🔧 Pendiente | 🔴 Alto | 🟡 Media |
| 6 | Multi-timeframe | 🔧 Pendiente | 🟡 Medio | 🟡 Media |
| 7 | Alertas/Notificaciones | 🔧 Pendiente | 🟡 Medio | 🟢 Baja |
| 8 | Risk Management | 🔧 Pendiente | 🔴 Alto | 🟡 Media |
| 9 | Order Flow | 🔧 Pendiente | 🟡 Medio | 🔴 Alta |
| 10 | Dashboard móvil responsive | 🔧 Pendiente | 🟢 Bajo | 🟢 Baja |
