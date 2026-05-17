# TradeIQ - Prompt Ultracorto para Cualquier IA
# Versión 1.0.0 | 2026-05-17

---

## 📋 CÓMO USAR ESTO

Copia SOLO el texto del recuadro de abajo y pégalo al inicio de una
nueva conversación con CUALQUIER IA. Es todo lo que necesitas.

---

## PROMPT ULTRACORTO (Copia esto ↓↓↓)

```
Estoy trabajando en TradeIQ (https://github.com/yecos/TradeIQ), una plataforma
de trading semi-automática con Next.js 16 + TypeScript.

ANTES de escribir cualquier código, LEE estos archivos del repo en orden:
1. WORKFLOW.md — Reglas obligatorias de desarrollo (10 reglas)
2. CHANGELOG.md — Estado actual del proyecto
3. docs/adr/ — Decisiones de arquitectura

Después de leerlos, SIGUE las reglas de WORKFLOW.md estrictamente:
- Lee archivos antes de modificarlos
- Usa ediciones quirúrgicas (no reescribir archivos completos)
- Planifica antes de codificar (espera mi aprobación)
- Verifica con lint después de cambiar
- Actualiza CHANGELOG.md por cada cambio
- No rompas interfaces sin actualizar dependientes

Confirma que leíste WORKFLOW.md diciendo:
"✅ Workflow TradeIQ cargado. ¿Qué necesitas?"
```

---

## 🎯 POR QUÉ ESTE PROMPT ES SUFICIENTE

En lugar de copiar 100+ líneas de reglas cada sesión, este prompt le dice
a la IA que LEA los archivos del repo. Las reglas detalladas están en:

- `WORKFLOW.md` → Reglas completas + arquitectura + roadmap
- `PROMPTS.md` → Prompts específicos por feature (para cuando necesites uno)
- `CHANGELOG.md` → Historial de cambios
- `docs/adr/` → Decisiones de arquitectura

---

## 🔧 COMBINAR CON PROMPT DE FEATURE

Si quieres trabajar en un feature específico, usa el prompt ultracorto +
el prompt del feature de PROMPTS.md:

```
[Prompt ultracorto de arriba]

Quiero trabajar en: [Feature #X de PROMPTS.md]
```

Por ejemplo:

```
[Prompt ultracorto]

Quiero trabajar en: Feature 1 - Datos reales con Polygon.io
```
