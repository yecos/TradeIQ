const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, HeadingLevel, PageBreak, BorderStyle,
  ShadingType, PageNumber, Footer, Header, Tab, TabStopType, TabStopPosition,
  convertInchesToTwip, LevelFormat, NumberFormat, convertMillimetersToTwip,
  VerticalAlign, TableLayoutType,
} = require("docx");
const fs = require("fs");

// ── GO-1 Palette ──────────────────────────────────────────────────────
const P = {
  bg: "1A2330",
  primary: "FFFFFF",
  accent: "D4875A",
  cover: {
    titleColor: "FFFFFF",
    subtitleColor: "B0B8C0",
    metaColor: "90989F",
    footerColor: "687078",
  },
  table: {
    headerBg: "D4875A",
    headerText: "FFFFFF",
    accentLine: "D4875A",
    innerLine: "DDD0C8",
    surface: "F8F0EB",
  },
};

const FONT = "Calibri";
const FONT_CJK = "Microsoft YaHei";
const LINE_SPACING = 312; // 1.3x

// ── Helpers ───────────────────────────────────────────────────────────
function txt(text, opts = {}) {
  return new TextRun({
    text,
    font: { name: FONT, eastAsia: FONT_CJK },
    size: opts.size || 22,
    bold: opts.bold || false,
    italics: opts.italics || false,
    color: opts.color || "333333",
    ...opts,
  });
}

function para(runs, opts = {}) {
  const p = new Paragraph({
    spacing: { line: LINE_SPACING, after: opts.after || 120 },
    alignment: opts.alignment || AlignmentType.LEFT,
    ...opts,
  });
  if (Array.isArray(runs)) {
    p.addRun(runs);
  } else {
    p.addRun(runs);
  }
  return p;
}

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { line: LINE_SPACING, before: 360, after: 200 },
    children: [
      txt(text, { size: 32, bold: true, color: P.accent }),
    ],
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent },
    },
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { line: LINE_SPACING, before: 280, after: 160 },
    children: [
      txt(text, { size: 26, bold: true, color: "2C3E50" }),
    ],
  });
}

function bodyPara(text, opts = {}) {
  return new Paragraph({
    spacing: { line: LINE_SPACING, after: 100 },
    alignment: opts.alignment || AlignmentType.JUSTIFIED,
    children: [
      txt(text, { size: 22, color: "333333" }),
    ],
    ...opts,
  });
}

function bulletPara(text, level = 0) {
  return new Paragraph({
    spacing: { line: LINE_SPACING, after: 60 },
    indent: { left: convertInchesToTwip(0.5 + level * 0.3) },
    children: [
      txt("• ", { size: 22, color: P.accent }),
      txt(text, { size: 22, color: "333333" }),
    ],
  });
}

function numberedPara(number, text) {
  return new Paragraph({
    spacing: { line: LINE_SPACING, after: 80 },
    indent: { left: convertInchesToTwip(0.4) },
    children: [
      txt(`${number}. `, { size: 22, bold: true, color: P.accent }),
      txt(text, { size: 22, color: "333333" }),
    ],
  });
}

function emptyLine(size = 120) {
  return new Paragraph({ spacing: { after: size }, children: [] });
}

// ── Table Helpers ─────────────────────────────────────────────────────
function headerCell(text, width) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.DXA } : undefined,
    shading: { type: ShadingType.CLEAR, color: P.table.headerBg },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        spacing: { line: LINE_SPACING },
        alignment: AlignmentType.CENTER,
        children: [txt(text, { size: 20, bold: true, color: P.table.headerText })],
      }),
    ],
  });
}

function dataCell(text, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shaded
      ? { type: ShadingType.CLEAR, color: P.table.surface }
      : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    children: [
      new Paragraph({
        spacing: { line: LINE_SPACING },
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [txt(text, { size: 20, color: opts.color || "333333", bold: opts.bold || false })],
      }),
    ],
  });
}

function multiLineCell(lines, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shaded ? { type: ShadingType.CLEAR, color: P.table.surface } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    children: lines.map(
      (l) =>
        new Paragraph({
          spacing: { line: LINE_SPACING },
          children: [txt(l, { size: 20, color: opts.color || "333333" })],
        })
    ),
  });
}

function codeBlockCell(lines, opts = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts.shaded ? { type: ShadingType.CLEAR, color: P.table.surface } : undefined,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 50, bottom: 50, left: 100, right: 100 },
    children: lines.map(
      (l) =>
        new Paragraph({
          spacing: { line: 260 },
          children: [txt(l, { size: 18, color: "2C3E50", font: { name: "Consolas", eastAsia: FONT_CJK } })],
        })
    ),
  });
}

// ── Cover Page (R4 recipe) ───────────────────────────────────────────
function coverPage() {
  const fullW = convertInchesToTwip(7.5);

  return [
    // Top color block table
    new Table({
      rows: [
        new TableRow({
          height: { value: convertInchesToTwip(5.5), rule: "exact" },
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: P.bg },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 0, bottom: 0, left: 600, right: 600 },
              children: [
                emptyLine(600),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 80 },
                  children: [
                    txt("TradeIQ", { size: 72, bold: true, color: P.cover.titleColor }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 200 },
                  children: [
                    txt("Flujo de Trabajo, Reglas y Arquitectura Escalable", {
                      size: 30,
                      color: P.cover.subtitleColor,
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 60 },
                  border: {
                    bottom: { style: BorderStyle.SINGLE, size: 3, color: P.accent },
                  },
                  children: [],
                }),
                emptyLine(100),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 60 },
                  children: [
                    txt("Guía de Desarrollo con IA para la Plataforma de Trading", {
                      size: 22,
                      color: P.cover.subtitleColor,
                      italics: true,
                    }),
                  ],
                }),
                emptyLine(200),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 40 },
                  children: [
                    txt("Versión 1.0 — Mayo 2026", {
                      size: 20,
                      color: P.cover.metaColor,
                    }),
                  ],
                }),
                new Paragraph({
                  alignment: AlignmentType.LEFT,
                  spacing: { after: 40 },
                  children: [
                    txt("Documento de referencia para desarrollo con IA", {
                      size: 20,
                      color: P.cover.metaColor,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    emptyLine(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        txt("────────────────────────────────────────", { size: 18, color: P.cover.footerColor }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        txt("Este documento es confidencial y de uso interno.", { size: 18, color: P.cover.footerColor, italics: true }),
      ],
    }),
    new Paragraph({
      children: [new PageBreak()],
    }),
  ];
}

// ── Section 1: Filosofía y Principios ─────────────────────────────────
function section1() {
  return [
    heading1("SECCIÓN 1: FILOSOFÍA Y PRINCIPIOS"),
    emptyLine(80),
    bodyPara(
      "El desarrollo de TradeIQ con asistencia de IA se rige por un conjunto de principios fundamentales que garantizan la calidad, seguridad y mantenibilidad del código. Estos principios no son sugerencias: son reglas inviolables que protegen la integridad del proyecto."
    ),
    emptyLine(60),
    heading2("Principio 1: La IA es un asistente, no un reemplazo"),
    bodyPara(
      "La inteligencia artificial acelera el desarrollo, pero el criterio humano es indispensable. Cada decisión de diseño, cada elección arquitectónica y cada aceptación de código generado debe pasar por la validación del desarrollador. La IA propone, el humano decide."
    ),
    emptyLine(60),
    heading2("Principio 2: Nunca se modifica código sin entender qué hace"),
    bodyPara(
      "Antes de realizar cualquier cambio, es obligatorio leer y comprender el código existente. Modificar código sin entender su propósito y sus dependencias es la causa más común de regresiones y bugs difíciles de rastrear."
    ),
    emptyLine(60),
    heading2("Principio 3: Cada cambio debe ser reversible"),
    bodyPara(
      "Todo cambio realizado en el códigobase debe poder revertirse fácilmente. Esto se logra mediante commits atómicos, mensajes descriptivos y la práctica de hacer checkpoints antes de cada modificación significativa."
    ),
    emptyLine(60),
    heading2("Principio 4: La seguridad del código es prioridad #1"),
    bodyPara(
      "Ninguna funcionalidad, por importante que sea, justifica comprometer la seguridad del código. Credenciales nunca en el código fuente, endpoints siempre con manejo de errores, y datos sensibles siempre protegidos."
    ),
    emptyLine(60),
    heading2("Principio 5: Documentar todo cambio en la bitácora"),
    bodyPara(
      "El archivo CHANGELOG.md es la fuente de verdad del historial de cambios. Cada modificación, por pequeña que sea, debe quedar registrada con su fecha, tipo, descripción y archivos afectados."
    ),
    emptyLine(60),
    heading2("Principio 6: Probar antes de desplegar"),
    bodyPara(
      "Ningún cambio llega a producción sin haber sido verificado. El flujo obligatorio es: desarrollo → lint → prueba local → verificación visual (si aplica UI) → commit → deploy."
    ),
    emptyLine(60),
    heading2("Principio 7: Una mejora a la vez"),
    bodyPara(
      "Nunca se realizan múltiples cambios simultáneos. Cada modificación se implementa, prueba y confirma de forma individual. Esto facilita la identificación de problemas y mantiene la trazabilidad del proyecto."
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Section 2: Reglas Obligatorias para IA ────────────────────────────
function section2() {
  const rules = [
    ["R01", "Nunca sobreescribir un archivo existente sin leerlo primero", "Leer el contenido actual antes de cualquier modificación para evitar pérdida de código", "Pérdida irreversible de código"],
    ["R02", "Siempre hacer backup (git commit) antes de cambios grandes", "Crear un checkpoint con git commit antes de modificar archivos críticos o múltiples archivos", "Imposibilidad de revertir cambios rotos"],
    ["R03", "No modificar archivos que no están en el scope del cambio", "Solo tocar los archivos directamente relacionados con la tarea asignada", "Efectos colaterales no deseados"],
    ["R04", "Todo cambio nuevo debe pasar lint sin errores", "Ejecutar bun run lint y verificar que no haya errores antes de considerar un cambio completo", "Código con errores entra en producción"],
    ["R05", "No eliminar código existente sin confirmación del usuario", "Antes de borrar cualquier línea de código, preguntar al usuario si está seguro", "Pérdida de funcionalidad existente"],
    ["R06", "Usar el sistema de bitácora para registrar cada cambio", "Documentar cada modificación en CHANGELOG.md con el formato establecido", "Historial de cambios incompleto"],
    ["R07", "No agregar dependencias sin aprobación", "Consultar antes de instalar cualquier paquete npm nuevo en el proyecto", "Bloat y vulnerabilidades de seguridad"],
    ["R08", "Mantener separación de responsabilidades", "Backend en API routes, frontend en componentes, lógica en lib/. Nunca mezclar", "Código espagueti difícil de mantener"],
    ["R09", "No hardcodear credenciales o secrets", "Toda clave, token o secreto debe ir en variables de entorno (.env.local)", "Exposición de credenciales en el repo"],
    ["R10", "Todo endpoint nuevo debe tener manejo de errores", "Implementar try/catch con respuestas de error claras en cada API route", "Errores 500 sin mensaje útil al usuario"],
    ["R11", "No modificar el schema de Prisma sin migración", "Todo cambio al schema requiere bun run db:push y verificación de datos existentes", "Pérdida o corrupción de datos en BD"],
    ["R12", "Ejecutar bun run lint antes de cada commit", "Verificación obligatoria de lint como paso previo al commit final", "Errores de lint se acumulan"],
    ["R13", "No usar any en TypeScript", "Definir tipos explícitos para todas las variables, parámetros y retornos", "Pérdida de seguridad de tipos"],
    ["R14", "Componentes nuevos deben usar shadcn/ui cuando sea posible", "Priorizar componentes existentes de la librería antes de crear desde cero", "Inconsistencia en la UI y duplicación"],
    ["R15", "Los cambios de UI deben ser probados en móvil y desktop", "Verificar responsive design en ambos formatos antes de cerrar un cambio de UI", "Experiencia rota en dispositivos móviles"],
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("ID", 900),
      headerCell("Regla", 2800),
      headerCell("Descripción", 3800),
      headerCell("Consecuencia si se viola", 2800),
    ],
  });

  const dataRows = rules.map(
    ([id, rule, desc, consequence], i) =>
      new TableRow({
        children: [
          dataCell(id, { width: 900, center: true, bold: true, shaded: i % 2 === 1, color: P.accent }),
          dataCell(rule, { width: 2800, bold: true, shaded: i % 2 === 1 }),
          dataCell(desc, { width: 3800, shaded: i % 2 === 1 }),
          dataCell(consequence, { width: 2800, shaded: i % 2 === 1, color: "8B3A2A" }),
        ],
      })
  );

  return [
    heading1("SECCIÓN 2: REGLAS OBLIGATORIAS PARA IA"),
    emptyLine(80),
    bodyPara(
      "Las siguientes reglas son de cumplimiento obligatorio para cualquier asistente de IA que interactúe con el códigobase de TradeIQ. Violaciones a estas reglas pueden resultar en pérdida de código, bugs en producción o compromisos de seguridad."
    ),
    emptyLine(100),
    new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
    }),
    emptyLine(100),
    bodyPara(
      "Nota: Estas reglas son complementarias a los principios de la Sección 1. En caso de conflicto, la seguridad del código siempre tiene prioridad.",
      { italics: true }
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Section 3: Sistema de Bitácora ────────────────────────────────────
function section3() {
  const changelogEntries = [
    ["CHG-001", "2026-05-01", "Análisis Técnico", "FEATURE", "Implementación inicial de RSI y MACD", "lib/analysis/technical.ts", "TradeIQ AI", "Completado"],
    ["CHG-002", "2026-05-03", "Dashboard", "FEATURE", "Componente de señales de trading en tiempo real", "components/trading/signals-card.tsx", "TradeIQ AI", "Completado"],
    ["CHG-003", "2026-05-05", "Análisis Técnico", "FIX", "Corrección de cálculo de media móvil exponencial", "lib/analysis/technical.ts", "TradeIQ AI", "Completado"],
    ["CHG-004", "2026-05-08", "Config", "CONFIG", "Configuración de Prisma schema con modelos iniciales", "prisma/schema.prisma", "TradeIQ AI", "Completado"],
    ["CHG-005", "2026-05-10", "API", "REFACTOR", "Separación de endpoints de análisis y señales", "app/api/analyze/, app/api/signals/", "TradeIQ AI", "Completado"],
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("ID", 900),
      headerCell("Fecha", 1100),
      headerCell("Componente", 1300),
      headerCell("Tipo", 900),
      headerCell("Descripción", 2200),
      headerCell("Archivos", 1600),
      headerCell("Autor", 1100),
      headerCell("Estado", 1000),
    ],
  });

  const dataRows = changelogEntries.map((row, i) =>
    new TableRow({
      children: row.map((cell, j) =>
        dataCell(cell, {
          width: [900, 1100, 1300, 900, 2200, 1600, 1100, 1000][j],
          center: j === 0 || j === 3 || j === 7,
          bold: j === 0,
          shaded: i % 2 === 1,
          color: j === 3 ? (cell === "FIX" ? "C0392B" : cell === "BREAKING" ? "E74C3C" : P.accent) : undefined,
        })
      ),
    })
  );

  return [
    heading1("SECCIÓN 3: SISTEMA DE BITÁCORA (CHANGELOG)"),
    emptyLine(80),
    bodyPara(
      "El sistema de bitácora es el mecanismo central de trazabilidad de TradeIQ. Cada cambio realizado en el proyecto debe quedar registrado en el archivo CHANGELOG.md ubicado en la raíz del proyecto."
    ),
    emptyLine(60),
    heading2("Formato de cada entrada"),
    bodyPara("Cada entrada del changelog debe contener los siguientes campos:"),
    bulletPara("ID: Identificador único (formato CHG-XXX)"),
    bulletPara("Fecha: Fecha del cambio (YYYY-MM-DD)"),
    bulletPara("Componente: Módulo o área del proyecto afectada"),
    bulletPara("Tipo de cambio: Categoría del cambio realizado"),
    bulletPara("Descripción: Explicación clara y concisa del cambio"),
    bulletPara("Archivos afectados: Lista de archivos modificados"),
    bulletPara("Autor: Quién realizó el cambio"),
    bulletPara("Estado: Completado, En progreso, Revertido"),
    emptyLine(60),
    heading2("Tipos de cambio"),
    bulletPara("FEATURE — Nueva funcionalidad agregada"),
    bulletPara("FIX — Corrección de un bug"),
    bulletPara("REFACTOR — Mejora de código sin cambiar funcionalidad"),
    bulletPara("DOCS — Cambio en documentación"),
    bulletPara("CONFIG — Cambio en configuración del proyecto"),
    bulletPara("BREAKING — Cambio que rompe compatibilidad anterior"),
    emptyLine(60),
    heading2("Ubicación"),
    bodyPara("El archivo de bitácora se encuentra en: CHANGELOG.md (raíz del proyecto)"),
    emptyLine(60),
    heading2("Template de entrada"),
    new Table({
      rows: [
        new TableRow({
          children: [
            codeBlockCell([
              "### [CHG-XXX] - YYYY-MM-DD",
              "",
              "- **Componente:** [nombre del componente]",
              "- **Tipo:** [FEATURE|FIX|REFACTOR|DOCS|CONFIG|BREAKING]",
              "- **Descripción:** [descripción del cambio]",
              "- **Archivos afectados:**",
              "  - `ruta/al/archivo.ts`",
              "  - `ruta/al/otro-archivo.tsx`",
              "- **Autor:** [nombre o IA]",
              "- **Estado:** [Completado|En progreso|Revertido]",
            ], { shaded: true }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    emptyLine(80),
    heading2("Ejemplo de entradas reales"),
    new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Section 4: Flujo de Trabajo ───────────────────────────────────────
function section4() {
  return [
    heading1("SECCIÓN 4: FLUJO DE TRABAJO PARA CAMBIOS"),
    emptyLine(80),
    bodyPara(
      "El flujo de trabajo de TradeIQ está diseñado para garantizar que cada cambio sea seguro, trazable y reversible. Se compone de cinco fases secuenciales que deben completarse en orden."
    ),
    emptyLine(80),
    heading2("FASE 1: PLANIFICACIÓN"),
    bodyPara("En esta fase se define qué se va a hacer y se obtiene aprobación antes de tocar cualquier código."),
    numberedPara(1, "El usuario describe qué quiere cambiar o mejorar"),
    numberedPara(2, "La IA analiza el impacto: qué archivos se ven afectados, qué dependencias existen"),
    numberedPara(3, "La IA presenta un plan detallado con archivos a modificar y el orden de modificación"),
    numberedPara(4, "El usuario aprueba o modifica el plan antes de continuar"),
    emptyLine(60),
    heading2("FASE 2: PREPARACIÓN"),
    bodyPara("Antes de implementar, se prepara el entorno y se crea un punto de restauración."),
    numberedPara(5, "La IA lee todos los archivos que va a modificar (regla R01)"),
    numberedPara(6, "La IA hace git commit del estado actual como checkpoint (regla R02)"),
    numberedPara(7, "La IA documenta el plan en la bitácora CHANGELOG.md (regla R06)"),
    emptyLine(60),
    heading2("FASE 3: IMPLEMENTACIÓN"),
    bodyPara("Se realizan los cambios de forma incremental, un componente a la vez."),
    numberedPara(8, "La IA hace cambios de UN componente a la vez (principio 7)"),
    numberedPara(9, "Después de cada componente: se ejecuta bun run lint (regla R04)"),
    numberedPara(10, "Si lint falla: se corrige antes de continuar con el siguiente componente"),
    numberedPara(11, "El usuario verifica visualmente si es un cambio de UI (regla R15)"),
    emptyLine(60),
    heading2("FASE 4: VALIDACIÓN"),
    bodyPara("Se verifica que todo funciona correctamente antes de cerrar."),
    numberedPara(12, "Ejecutar lint completo del proyecto"),
    numberedPara(13, "Probar los endpoints afectados mediante llamadas de prueba"),
    numberedPara(14, "Verificar que la funcionalidad existente no se rompió (regresión)"),
    emptyLine(60),
    heading2("FASE 5: CIERRE"),
    bodyPara("Se finaliza el cambio y se actualiza la documentación."),
    numberedPara(15, "Git commit con mensaje descriptivo siguiendo el formato establecido"),
    numberedPara(16, "Actualizar CHANGELOG.md con la entrada correspondiente"),
    numberedPara(17, "El usuario confirma que todo funciona correctamente"),
    numberedPara(18, "Push a GitHub si procede según la estrategia de branching"),
    emptyLine(100),
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: P.table.surface },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: { line: LINE_SPACING },
                  alignment: AlignmentType.CENTER,
                  children: [
                    txt("PLANIFICACIÓN → PREPARACIÓN → IMPLEMENTACIÓN → VALIDACIÓN → CIERRE", {
                      size: 22, bold: true, color: P.accent,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Section 5: Estructura Escalable ──────────────────────────────────
function section5() {
  const currentStructure = [
    "src/",
    "├── app/api/          # API routes",
    "├── components/       # React components",
    "├── lib/              # Business logic",
    "└── prisma/           # Database",
  ];

  const targetStructure = [
    "src/",
    "├── app/",
    "│   ├── api/",
    "│   │   ├── market/        # Market data endpoints",
    "│   │   ├── analyze/       # Analysis engine",
    "│   │   ├── signals/       # Signal management",
    "│   │   ├── journal/       # Trade journal",
    "│   │   ├── broker/        # Broker integration",
    "│   │   └── backtest/      # Backtesting (futuro)",
    "│   └── page.tsx",
    "├── components/",
    "│   ├── trading/           # Trading-specific components",
    "│   └── ui/                # shadcn/ui base components",
    "├── lib/",
    "│   ├── analysis/          # Analysis engines (separated)",
    "│   │   ├── technical.ts",
    "│   │   ├── patterns.ts",
    "│   │   ├── volume.ts",
    "│   │   ├── news.ts        # (futuro)",
    "│   │   └── sentiment.ts   # (futuro)",
    "│   ├── broker/            # Broker integrations",
    "│   │   ├── alpaca.ts      # (futuro)",
    "│   │   └── types.ts",
    "│   ├── data/              # Data providers",
    "│   │   ├── polygon.ts     # (futuro)",
    "│   │   └── market-data.ts",
    "│   ├── engine/            # Core engine",
    "│   │   ├── confluence.ts",
    "│   │   └── risk.ts        # (futuro)",
    "│   └── types.ts",
    "└── prisma/",
    "    └── schema.prisma",
  ];

  return [
    heading1("SECCIÓN 5: ESTRUCTURA ESCALABLE DEL PROYECTO"),
    emptyLine(80),
    bodyPara(
      "La arquitectura de TradeIQ está diseñada para crecer de forma organizada. A continuación se presenta la estructura actual y la estructura objetivo escalable hacia la que se debe evolucionar."
    ),
    emptyLine(60),
    heading2("Estructura actual"),
    new Table({
      rows: [
        new TableRow({
          children: [
            codeBlockCell(currentStructure, { shaded: true }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    emptyLine(80),
    heading2("Estructura objetivo (escalable)"),
    bodyPara(
      "La estructura objetivo separa responsabilidades por dominio funcional, facilitando la incorporación de nuevos módulos sin afectar los existentes."
    ),
    emptyLine(40),
    new Table({
      rows: [
        new TableRow({
          children: [
            codeBlockCell(targetStructure, { shaded: true }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    emptyLine(80),
    heading2("Principios de la estructura escalable"),
    bulletPara("Separación por dominio: Cada carpeta representa un dominio funcional claro"),
    bulletPara("Independencia: Los módulos pueden desarrollarse y probarse de forma independiente"),
    bulletPara("Extensibilidad: Nuevos módulos se agregan sin modificar los existentes"),
    bulletPara("Convención sobre configuración: La estructura sigue convenciones predecibles"),
    bulletPara("Escalabilidad horizontal: Se pueden agregar más analysis engines, brokers o data providers sin refactorizar"),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Section 6: Roadmap ────────────────────────────────────────────────
function section6() {
  const roadmap = [
    ["P1", "Datos reales de mercado (Polygon.io)", "Alto", "Medio", "2 semanas"],
    ["P1", "Gráfico en tiempo real (WebSocket)", "Alto", "Alto", "3 semanas"],
    ["P1", "Backtesting de estrategias", "Alto", "Alto", "4 semanas"],
    ["P2", "IA para noticias (z-ai-web-dev-sdk)", "Medio", "Medio", "2 semanas"],
    ["P2", "Conexión real Alpaca (paper trading)", "Medio", "Medio", "2 semanas"],
    ["P2", "Alertas y notificaciones", "Medio", "Bajo", "1 semana"],
    ["P2", "Multi-timeframe", "Medio", "Medio", "2 semanas"],
    ["P3", "Order flow / Level 2 data", "Alto", "Alto", "4 semanas"],
    ["P3", "Risk management visual", "Medio", "Bajo", "1 semana"],
    ["P3", "Exportar señales a Excel/PDF", "Bajo", "Bajo", "1 semana"],
    ["P3", "Mobile responsive", "Medio", "Medio", "2 semanas"],
    ["P4", "Múltiples brokers", "Medio", "Alto", "4 semanas"],
    ["P4", "Modo dark/light toggle", "Bajo", "Bajo", "3 días"],
    ["P4", "Comunidad / compartir setups", "Medio", "Alto", "6 semanas"],
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("Prioridad", 1200),
      headerCell("Mejora", 3000),
      headerCell("Impacto", 1200),
      headerCell("Esfuerzo", 1200),
      headerCell("Semanas estimadas", 1600),
    ],
  });

  const priorityColors = { P1: "C0392B", P2: "D4875A", P3: "2E86C1", P4: "7F8C8D" };

  const dataRows = roadmap.map(
    ([pri, mejora, impacto, esfuerzo, semanas], i) =>
      new TableRow({
        children: [
          dataCell(pri, { width: 1200, center: true, bold: true, shaded: i % 2 === 1, color: priorityColors[pri] }),
          dataCell(mejora, { width: 3000, bold: true, shaded: i % 2 === 1 }),
          dataCell(impacto, { width: 1200, center: true, shaded: i % 2 === 1, color: impacto === "Alto" ? "C0392B" : impacto === "Medio" ? "D4875A" : "7F8C8D" }),
          dataCell(esfuerzo, { width: 1200, center: true, shaded: i % 2 === 1 }),
          dataCell(semanas, { width: 1600, center: true, shaded: i % 2 === 1 }),
        ],
      })
  );

  return [
    heading1("SECCIÓN 6: ROADMAP DE MEJORAS PRIORIZADAS"),
    emptyLine(80),
    bodyPara(
      "El roadmap establece las mejoras planificadas para TradeIQ, organizadas por prioridad. P1 es la prioridad más alta (crítica para el MVP) y P4 es la más baja (deseable pero no urgente)."
    ),
    emptyLine(80),
    heading2("Prioridades definidas"),
    bulletPara("P1 — Crítico: Funcionalidades esenciales para el producto mínimo viable"),
    bulletPara("P2 — Importante: Mejoras significativas que aumentan el valor del producto"),
    bulletPara("P3 — Deseable: Funcionalidades que mejoran la experiencia pero no son críticas"),
    bulletPara("P4 — Futuro: Mejoras a largo plazo que se abordarán cuando los recursos lo permitan"),
    emptyLine(80),
    new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
    }),
    emptyLine(80),
    heading2("Resumen de timeline estimado"),
    bodyPara("El tiempo total estimado para completar todas las mejoras del roadmap es de aproximadamente 34 semanas de desarrollo, distribuidas de la siguiente forma:"),
    bulletPara("P1 (Crítico): 9 semanas — Datos reales, gráficos en vivo y backtesting"),
    bulletPara("P2 (Importante): 7 semanas — IA de noticias, paper trading, alertas y multi-timeframe"),
    bulletPara("P3 (Deseable): 8 semanas — Order flow, risk visual, exportación y responsive"),
    bulletPara("P4 (Futuro): 10+ semanas — Multi-broker, temas, comunidad"),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Section 7: Protección y Seguridad ─────────────────────────────────
function section7() {
  return [
    heading1("SECCIÓN 7: PROTECCIÓN Y SEGURIDAD DEL CÓDIGO"),
    emptyLine(80),
    bodyPara(
      "La protección del código fuente y la seguridad de los datos son fundamentales para TradeIQ. Esta sección define las estrategias de branching, convenciones de commits y prácticas de seguridad que deben seguirse."
    ),
    emptyLine(60),
    heading2("Estrategia de Git Branching"),
    bodyPara("TradeIQ utiliza un modelo de branching simplificado basado en Git Flow:"),
    bulletPara("main — Rama de producción. Solo se mergea código probado y validado."),
    bulletPara("develop — Rama de desarrollo integrado. Todos los features se mergean aquí primero."),
    bulletPara("feature/* — Ramas para nuevas funcionalidades (ej: feature/real-time-charts)"),
    bulletPara("fix/* — Ramas para corrección de bugs (ej: fix/rsi-calculation-error)"),
    bulletPara("hotfix/* — Ramas para correcciones urgentes en producción"),
    emptyLine(60),
    heading2("Formato de mensajes de commit"),
    bodyPara("Todos los commits deben seguir el formato Conventional Commits:"),
    emptyLine(40),
    new Table({
      rows: [
        new TableRow({
          children: [
            codeBlockCell([
              "tipo(scope): descripción",
              "",
              "Ejemplos:",
              "feat(analysis): add RSI divergence detection",
              "fix(signals): correct signal strength calculation",
              "refactor(api): separate market and analysis endpoints",
              "docs(changelog): update CHANGELOG for v1.2",
              "config(prisma): add TradeJournal model",
              "BREAKING(api): change signal response format",
            ], { shaded: true }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    emptyLine(60),
    heading2("Tipos de commit"),
    new Table({
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            headerCell("Tipo", 1500),
            headerCell("Uso", 5500),
          ],
        }),
        ...([
          ["feat", "Nueva funcionalidad para el usuario"],
          ["fix", "Corrección de un bug que afecta al usuario"],
          ["refactor", "Refactorización de código sin cambio de funcionalidad"],
          ["docs", "Cambios en documentación"],
          ["config", "Cambios en configuración (Prisma, ESLint, etc.)"],
          ["test", "Adición o modificación de tests"],
          ["BREAKING", "Cambio que rompe compatibilidad anterior"],
        ]).map(([type, desc], i) =>
          new TableRow({
            children: [
              dataCell(type, { width: 1500, bold: true, shaded: i % 2 === 1, color: P.accent }),
              dataCell(desc, { width: 5500, shaded: i % 2 === 1 }),
            ],
          })
        ),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
    }),
    emptyLine(60),
    heading2("Reglas de protección"),
    bulletPara("NUNCA hacer force push a la rama main"),
    bulletPara("NUNCA commitear el archivo .env.local — siempre en .gitignore"),
    bulletPara("API keys siempre en variables de entorno, nunca en el código fuente"),
    bulletPara("Usar tags para versiones: v1.0.0, v1.1.0, etc. (SemVer)"),
    bulletPara("Cada PR a main debe tener al menos un review"),
    emptyLine(60),
    heading2("Pre-commit hooks recomendados"),
    bulletPara("Ejecutar lint automáticamente antes de cada commit (husky + lint-staged)"),
    bulletPara("Verificar que no hay console.log() en el código"),
    bulletPara("Verificar que no hay credenciales hardcodeadas (git-secrets)"),
    emptyLine(60),
    heading2("CI/CD con Vercel"),
    bulletPara("Auto-deploy desde la rama main → producción"),
    bulletPara("Preview deployments desde la rama develop y feature branches"),
    bulletPara("Cada PR genera un preview URL único para verificación visual"),
    bulletPara("Los deployments fallidos se revierten automáticamente"),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// ── Section 8: Checklist ──────────────────────────────────────────────
function section8() {
  const checklist = [
    [1, "¿Leíste los archivos que vas a modificar?"],
    [2, "¿Hiciste git commit del estado actual?"],
    [3, "¿El cambio está documentado en CHANGELOG?"],
    [4, "¿Solo modificas los archivos necesarios?"],
    [5, "¿Pasó lint sin errores?"],
    [6, "¿Probaste los endpoints afectados?"],
    [7, "¿La UI funciona en desktop y móvil?"],
    [8, "¿No se rompió funcionalidad existente?"],
    [9, "¿Hiciste git commit del cambio?"],
    [10, "¿Actualizaste CHANGELOG.md?"],
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell("#", 700),
      headerCell("Paso", 5300),
      headerCell("Hecho?", 1000),
    ],
  });

  const dataRows = checklist.map(
    ([num, step], i) =>
      new TableRow({
        children: [
          dataCell(String(num), { width: 700, center: true, bold: true, shaded: i % 2 === 1, color: P.accent }),
          dataCell(step, { width: 5300, shaded: i % 2 === 1 }),
          dataCell("☐", { width: 1000, center: true, shaded: i % 2 === 1, size: 24 }),
        ],
      })
  );

  return [
    heading1("SECCIÓN 8: CHECKLIST ANTES DE CADA CAMBIO"),
    emptyLine(80),
    bodyPara(
      "Esta checklist es una herramienta práctica que debe revisarse antes, durante y después de cada cambio en el códigobase. Imprime esta sección o mantenla visible durante el desarrollo."
    ),
    emptyLine(80),
    new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
    }),
    emptyLine(100),
    heading2("Cómo usar esta checklist"),
    bulletPara("ANTES del cambio: Verificar los pasos 1-4"),
    bulletPara("DURANTE el cambio: Verificar los pasos 5-7"),
    bulletPara("DESPUÉS del cambio: Verificar los pasos 8-10"),
    emptyLine(80),
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, color: P.bg },
              margins: { top: 100, bottom: 100, left: 150, right: 150 },
              children: [
                new Paragraph({
                  spacing: { line: LINE_SPACING },
                  alignment: AlignmentType.CENTER,
                  children: [
                    txt("⚠ ", { size: 22, bold: true, color: P.accent }),
                    txt("Si un paso de la checklist no se cumple, ", { size: 22, color: P.primary }),
                    txt("NO CONTINÚES", { size: 22, bold: true, color: P.accent }),
                    txt(" con el siguiente paso hasta resolver el problema.", { size: 22, color: P.primary }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
  ];
}

// ── Build Document ────────────────────────────────────────────────────
async function generateDocument() {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: { name: FONT, eastAsia: FONT_CJK },
            size: 22,
          },
          paragraph: {
            spacing: { line: LINE_SPACING },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  txt("TradeIQ — Flujo de Trabajo y Arquitectura", { size: 16, color: "999999" }),
                  txt("  |  ", { size: 16, color: "CCCCCC" }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: { name: FONT, eastAsia: FONT_CJK },
                    size: 16,
                    color: "999999",
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          ...coverPage(),
          ...section1(),
          ...section2(),
          ...section3(),
          ...section4(),
          ...section5(),
          ...section6(),
          ...section7(),
          ...section8(),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = "/home/z/my-project/download/TradeIQ_Flujo_de_Trabajo_y_Arquitectura.docx";
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ Document generated successfully: ${outputPath}`);
  console.log(`   File size: ${(buffer.length / 1024).toFixed(1)} KB`);
}

generateDocument().catch((err) => {
  console.error("❌ Error generating document:", err);
  process.exit(1);
});
