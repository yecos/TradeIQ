# ADR-001: SQLite para prototipo, PostgreSQL en producción

## Estado: Aceptado

## Contexto
TradeIQ necesita una base de datos para almacenar señales, journal, watchlist y configuración de broker. En la fase de prototipo se necesita algo rápido de configurar y sin dependencias externas.

## Decisión
Usar SQLite con Prisma ORM durante la fase de desarrollo y prototipo. Migrar a PostgreSQL cuando la app esté lista para producción en Vercel.

## Consecuencias
### Positivas
- Zero configuración - solo un archivo
- Funciona en Vercel con @prisma/adapter-libsql
- Desarrollo local sin Docker ni servicios externos
- Prisma abstrae la migración a PostgreSQL

### Negativas
- SQLite no soporta conexiones concurrentes para escritura
- No hay soporte nativo para funciones avanzadas de SQL
- En producción con muchos usuarios, PostgreSQL será necesario
- Vercel Serverless Functions tienen limitaciones con SQLite

## Plan de Migración
1. Cambiar `provider = "postgresql"` en schema.prisma
2. Actualizar DATABASE_URL a conexión PostgreSQL
3. Ejecutar `prisma migrate deploy`
4. Migrar datos existentes si es necesario
