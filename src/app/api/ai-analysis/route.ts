import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 30;

interface AIAnalysisRequest {
  symbol: string;
  timeframe?: string;
  question?: string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Pre-computed analysis data from the frontend — avoids re-computation */
  analysisData?: {
    currentPrice?: number;
    priceChange?: number;
    technical?: Record<string, unknown> | null;
    patterns?: Record<string, unknown> | null;
    volume?: Record<string, unknown> | null;
    news?: Record<string, unknown> | null;
    sentiment?: Record<string, unknown> | null;
    macro?: Record<string, unknown> | null;
    confluence?: Record<string, unknown> | null;
    multiTimeframe?: Record<string, unknown> | null;
  } | null;
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[AI Analysis] OPENAI_API_KEY is not set');
      return NextResponse.json(
        {
          error: 'OpenAI API key not configured',
          details: 'Please add your OPENAI_API_KEY in Vercel Environment Variables. Go to your Vercel project → Settings → Environment Variables → Add OPENAI_API_KEY with your OpenAI API key.',
        },
        { status: 503 }
      );
    }

    const body: AIAnalysisRequest = await request.json();
    const { symbol, timeframe = '1D', question, conversationHistory = [], analysisData } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
    }

    const systemPrompt = buildSystemPrompt(symbol, timeframe, analysisData ?? {});

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      {
        role: 'user',
        content: question || `Analiza ${symbol} en temporalidad ${timeframe} y dame tu evaluación completa con recomendación de trading.`,
      },
    ];

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
      max_tokens: 2000,
    });

    const aiResponse = completion.choices?.[0]?.message?.content || 'No se pudo generar el análisis.';

    const c = analysisData?.confluence as { overallDirection?: string; confluenceScore?: number; riskReward?: number; entryPrice?: number; stopLoss?: number; takeProfit?: number } | undefined;

    // Parse structured data from AI response for auto-recording
    const parsedTrade = parseTradeFromResponse(aiResponse, symbol, timeframe, analysisData ?? {});

    return NextResponse.json({
      analysis: aiResponse,
      marketSummary: {
        symbol,
        price: analysisData?.currentPrice ?? 0,
        change: analysisData?.priceChange ?? 0,
        confluenceDirection: c?.overallDirection,
        confluenceScore: c?.confluenceScore,
        riskReward: c?.riskReward,
      },
      tradeRecommendation: parsedTrade,
      timestamp: Date.now(),
      model: completion.model,
    });
  } catch (error) {
    console.error('[AI Analysis] Error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && 'status' in error) {
      const openaiError = error as { status?: number; error?: { message?: string } };
      if (openaiError.status === 401) {
        return NextResponse.json({ error: 'Invalid OpenAI API key', details: 'The OPENAI_API_KEY is invalid or expired. Check your key at https://platform.openai.com/api-keys' }, { status: 401 });
      }
      if (openaiError.status === 429) {
        return NextResponse.json({ error: 'OpenAI rate limit exceeded', details: 'Too many requests. Wait a moment and try again.' }, { status: 429 });
      }
      if (openaiError.status === 404) {
        return NextResponse.json({ error: 'Model not available', details: 'GPT-4o may not be available with your API key tier. Check your plan at https://platform.openai.com/account/billing' }, { status: 404 });
      }
    }
    return NextResponse.json({ error: 'AI analysis failed', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

/**
 * Parse the AI response to extract a structured trade recommendation.
 * This allows the frontend to auto-fill the "Register Trade" form.
 */
function parseTradeFromResponse(
  aiResponse: string,
  symbol: string,
  timeframe: string,
  analysisData: NonNullable<AIAnalysisRequest['analysisData']>
) {
  const price = analysisData?.currentPrice ?? 0;
  const c = analysisData?.confluence as {
    overallDirection?: string; confluenceScore?: number;
    entryPrice?: number; stopLoss?: number; takeProfit?: number; riskReward?: number;
  } | undefined;

  // Try to extract direction from AI response
  let direction = c?.overallDirection || 'NEUTRAL';
  const buyMatch = aiResponse.match(/\b(?:BUY|COMPRAR|LONG|ALCISTA)\b/i);
  const sellMatch = aiResponse.match(/\b(?:SELL|VENDER|SHORT|BAJISTA)\b/i);
  const waitMatch = aiResponse.match(/\b(?:WAIT|ESPERAR|NEUTRAL|MANTENER)\b/i);

  if (waitMatch && !buyMatch && !sellMatch) direction = 'NEUTRAL';
  else if (buyMatch && !sellMatch) direction = 'LONG';
  else if (sellMatch && !buyMatch) direction = 'SHORT';

  // Try to extract entry, SL, TP from AI response
  const entryMatch = aiResponse.match(/(?:Entrada|Entry|entrada)[^\d]*\$?([\d,]+\.?\d*)/i);
  const slMatch = aiResponse.match(/(?:Stop\s*Loss|SL|stop\s*loss)[^\d]*\$?([\d,]+\.?\d*)/i);
  const tpMatch = aiResponse.match(/(?:Take\s*Profit|TP|take\s*profit)[^\d]*\$?([\d,]+\.?\d*)/i);
  const rrMatch = aiResponse.match(/(?:Risk\s*[:\-]?\s*Reward|R\s*[:\-]?\s*R|Risk\s*:\s*Reward)[^\d]*([\d.]+)\s*[:\/]?\s*([\d.]+)?/i);
  const confMatch = aiResponse.match(/(?:Confianza|Confidence|confianza)[^\w]*(Alta|Media|Baja|High|Medium|Low)/i);

  const parseNum = (s: string | undefined) => s ? parseFloat(s.replace(/,/g, '')) : undefined;

  const entryPrice = entryMatch ? parseNum(entryMatch[1]) : c?.entryPrice ?? price;
  const stopLoss = slMatch ? parseNum(slMatch[1]) : c?.stopLoss;
  const takeProfit = tpMatch ? parseNum(tpMatch[1]) : c?.takeProfit;
  const riskReward = rrMatch ? parseFloat(rrMatch[2] || rrMatch[1]) : c?.riskReward;
  const confidence = confMatch
    ? confMatch[1].toLowerCase() === 'alta' || confMatch[1].toLowerCase() === 'high'
      ? 'Alta'
      : confMatch[1].toLowerCase() === 'baja' || confMatch[1].toLowerCase() === 'low'
        ? 'Baja'
        : 'Media'
    : undefined;

  // Calculate expiration based on timeframe
  const expirationHours: Record<string, number> = {
    '1m': 1, '5m': 2, '15m': 4, '1H': 8, '4H': 24, '1D': 72, '1W': 168,
  };
  const hours = expirationHours[timeframe] || 72;
  const expiresAt = new Date(Date.now() + hours * 3600000).toISOString();

  // Only return a trade recommendation if there's a clear direction
  if (direction === 'NEUTRAL' || !stopLoss || !takeProfit) {
    return null;
  }

  return {
    symbol,
    timeframe,
    direction,
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward,
    confidence,
    confluenceScore: c?.confluenceScore,
    expiresAt,
    aiAnalysis: aiResponse.substring(0, 2000), // Truncate for storage
  };
}

function buildSystemPrompt(
  symbol: string,
  timeframe: string,
  data: NonNullable<AIAnalysisRequest['analysisData']>
): string {
  const tfLabels: Record<string, string> = {
    '1m': '1 minuto', '5m': '5 minutos', '15m': '15 minutos',
    '1H': '1 hora', '4H': '4 horas', '1D': '1 día', '1W': '1 semana',
  };

  const formatPrice = (p: number) => p >= 1
    ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : p.toFixed(6);

  const price = data.currentPrice ?? 0;
  const change = data.priceChange ?? 0;

  let prompt = `Eres un analista de trading profesional experto en mercados financieros y criptomonedas. Tu nombre es TradeIQ AI y trabajas para la plataforma TradeIQ. Utilizas el modelo GPT-4o para ofrecer análisis de alta calidad.

ANALIZAS datos reales del mercado y proporcionas recomendaciones de trading basadas en evidencia.

DATOS ACTUALES DE MERCADO
Símbolo: ${symbol}
Precio actual: $${formatPrice(price)}
Cambio: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%
Temporalidad: ${tfLabels[timeframe] || timeframe}

`;

  const t = data.technical as {
    rsi?: number;
    macd?: { value?: number; signal?: number; histogram?: number };
    ema20?: number; ema50?: number; sma200?: number;
    bollingerBands?: { upper?: number; middle?: number; lower?: number };
    adx?: number; atr?: number;
    stochRSI?: { k?: number; d?: number };
    signals?: Array<{ vectorName?: string; direction?: string; strength?: number; detail?: string }>;
  } | null;

  if (t) {
    prompt += `ANALISIS TECNICO
RSI(14): ${t.rsi?.toFixed(1) ?? 'N/A'} ${(t.rsi ?? 0) > 70 ? '(SOBRECOMPRADO)' : (t.rsi ?? 0) < 30 ? '(SOBREVENDIDO)' : '(NEUTRAL)'}
MACD: Linea ${t.macd?.value?.toFixed(2) ?? 'N/A'}, Senal ${t.macd?.signal?.toFixed(2) ?? 'N/A'}, Histograma ${t.macd?.histogram?.toFixed(2) ?? 'N/A'} ${(t.macd?.histogram ?? 0) > 0 ? '(ALCISTA)' : '(BAJISTA)'}
EMA 20: $${t.ema20 != null ? formatPrice(t.ema20) : 'N/A'} — Precio ${price > (t.ema20 ?? 0) ? 'POR ENCIMA (alcista)' : 'POR DEBAJO (bajista)'}
EMA 50: $${t.ema50 != null ? formatPrice(t.ema50) : 'N/A'} — Precio ${price > (t.ema50 ?? 0) ? 'POR ENCIMA (alcista)' : 'POR DEBAJO (bajista)'}
Bollinger Bands: Superior $${t.bollingerBands?.upper != null ? formatPrice(t.bollingerBands.upper) : 'N/A'}, Media $${t.bollingerBands?.middle != null ? formatPrice(t.bollingerBands.middle) : 'N/A'}, Inferior $${t.bollingerBands?.lower != null ? formatPrice(t.bollingerBands.lower) : 'N/A'}
ADX: ${t.adx?.toFixed(1) ?? 'N/A'} ${(t.adx ?? 0) > 25 ? '(TENDENCIA FUERTE)' : '(TENDENCIA DEBIL)'}
ATR: $${t.atr != null ? formatPrice(t.atr) : 'N/A'} (volatilidad)
StochRSI: K=${t.stochRSI?.k?.toFixed(0) ?? 'N/A'} D=${t.stochRSI?.d?.toFixed(0) ?? 'N/A'}
Senales tecnicas: ${t.signals?.map(s => `${s.vectorName}: ${s.direction} (${s.strength}%)`).join(', ') || 'Ninguna'}

`;
  }

  const p = data.patterns as {
    patterns?: Array<{ name?: string; type?: string; reliability?: number; description?: string }>;
  } | null;

  if (p && p.patterns && p.patterns.length > 0) {
    prompt += `PATRONES DE VELA
${p.patterns.map(pat => `- ${pat.name} (${pat.type === 'bullish' ? 'ALCISTA' : pat.type === 'bearish' ? 'BAJISTA' : 'NEUTRAL'}, confiabilidad: ${pat.reliability}%): ${pat.description}`).join('\n')}

`;
  }

  const v = data.volume as {
    volumeTrend?: string; volumeRatio?: number; obv?: number;
    accumulationDistribution?: string;
  } | null;

  if (v) {
    prompt += `ANALISIS DE VOLUMEN
Ratio de volumen: ${v.volumeRatio?.toFixed(2) ?? 'N/A'}x ${(v.volumeRatio ?? 0) > 1.5 ? '(VOLUMEN ALTO)' : ''}
Tendencia: ${v.volumeTrend === 'increasing' ? 'Creciente' : v.volumeTrend === 'decreasing' ? 'Decreciente' : 'Estable'}
Acumulacion/Distribucion: ${v.accumulationDistribution === 'accumulation' ? 'ACUMULACION (alcista)' : v.accumulationDistribution === 'distribution' ? 'DISTRIBUCION (bajista)' : 'Neutral'}
OBV: ${(v.obv ?? 0) > 0 ? '+' : ''}${((v.obv ?? 0) / 1_000_000).toFixed(1)}M

`;
  }

  const n = data.news as {
    sentiment?: number; sentimentLabel?: string;
    headlines?: Array<{ title?: string; sentiment?: number; impact?: string }>;
  } | null;

  if (n) {
    const sentimentMap: Record<string, string> = {
      very_bullish: 'MUY ALCISTA', bullish: 'ALCISTA', neutral: 'NEUTRAL',
      bearish: 'BAJISTA', very_bearish: 'MUY BAJISTA',
    };
    prompt += `NOTICIAS
Sentimiento general: ${sentimentMap[n.sentimentLabel ?? ''] ?? n.sentimentLabel ?? 'N/A'} (${(n.sentiment ?? 0) > 0 ? '+' : ''}${((n.sentiment ?? 0) * 100).toFixed(0)}%)
${n.headlines && n.headlines.length > 0 ? `Titulares:\n${n.headlines.slice(0, 5).map(h => `- ${h.title} (impacto: ${h.impact})`).join('\n')}` : 'Sin noticias relevantes'}

`;
  }

  const s = data.sentiment as {
    fearGreedIndex?: number; socialSentiment?: number; putCallRatio?: number;
  } | null;

  if (s) {
    prompt += `SENTIMIENTO
Fear & Greed Index: ${s.fearGreedIndex ?? 'N/A'} ${(s.fearGreedIndex ?? 0) > 60 ? '(CODICIA)' : (s.fearGreedIndex ?? 0) < 40 ? '(MIEDO)' : '(NEUTRAL)'}
Sentimiento social: ${((s.socialSentiment ?? 0) * 100).toFixed(0)}% ${(s.socialSentiment ?? 0) > 0.2 ? '(POSITIVO)' : (s.socialSentiment ?? 0) < -0.2 ? '(NEGATIVO)' : '(NEUTRAL)'}
${s.putCallRatio ? `Put/Call Ratio: ${s.putCallRatio.toFixed(2)}` : ''}

`;
  }

  const m = data.macro as {
    fedRateTrend?: string;
    economicEvents?: Array<{ event?: string; impact?: string; date?: string; forecast?: string; previous?: string }>;
  } | null;

  if (m) {
    prompt += `MACROECONOMIA
Postura Fed: ${m.fedRateTrend === 'hawkish' ? 'HAWKISH (bajista para riesgo)' : m.fedRateTrend === 'dovish' ? 'DOVISH (alcista para riesgo)' : 'NEUTRAL'}
${m.economicEvents && m.economicEvents.length > 0 ? `Eventos economicos:\n${m.economicEvents.slice(0, 3).map(e => `- ${e.event} (${e.impact} impacto)`).join('\n')}` : ''}

`;
  }

  const mtf = data.multiTimeframe as {
    alignment?: number; overallDirection?: string;
    timeframes?: Array<{ label?: string; role?: string; direction?: string; strength?: number }>;
  } | null;

  if (mtf) {
    prompt += `ANALISIS MULTI-TIMEFRAME
Alineacion: ${mtf.alignment ?? 'N/A'}%
Direccion general: ${mtf.overallDirection ?? 'N/A'}
${mtf.timeframes?.map(tf => `- ${tf.label} (${tf.role}): ${tf.direction} fuerza ${tf.strength}%`).join('\n') ?? ''}

`;
  }

  const c = data.confluence as {
    overallDirection?: string; confluenceScore?: number;
    entryPrice?: number; stopLoss?: number; takeProfit?: number; riskReward?: number;
    vectorSignals?: Array<{ vectorName?: string; direction?: string; strength?: number }>;
    recommendation?: string;
  } | null;

  if (c) {
    prompt += `CONFLUENCIA GLOBAL
Direccion: ${c.overallDirection ?? 'N/A'} (Score: ${c.confluenceScore ?? 0}%)
Entrada: $${c.entryPrice != null ? formatPrice(c.entryPrice) : 'N/A'}
Stop Loss: $${c.stopLoss != null ? formatPrice(c.stopLoss) : 'N/A'}
Take Profit: $${c.takeProfit != null ? formatPrice(c.takeProfit) : 'N/A'}
Risk:Reward: ${c.riskReward?.toFixed(2) ?? 'N/A'}
Vectores: ${c.vectorSignals?.map(vs => `${vs.vectorName}=${vs.direction}(${vs.strength}%)`).join(', ') ?? 'N/A'}
Recomendacion del motor: ${c.recommendation ?? 'N/A'}

`;
  }

  if (!t && !p && !v && !n && !s && !m && !c) {
    prompt += `NOTA: No hay datos de analisis disponibles todavia. El usuario debe ejecutar un analisis primero (clic en "Analizar"). Responde basandote en tu conocimiento general pero indica que los datos no estan disponibles.

`;
  }

  // Expiration guidance per timeframe
  const expirationGuide: Record<string, string> = {
    '1m': '1 hora', '5m': '2 horas', '15m': '4 horas',
    '1H': '8 horas', '4H': '24 horas', '1D': '3 dias', '1W': '1 semana',
  };

  prompt += `INSTRUCCIONES
Eres un asistente de trading inteligente impulsado por GPT-4o. Basandote en TODOS los datos anteriores:

1. **Resumen ejecutivo**: Diagnostico claro del estado actual del activo
2. **Analisis tecnico**: Evalua los indicadores, soportes/resistencias clave, y la tendencia dominante
3. **Factores fundamentales**: Noticias, sentimiento, y macro que afectan el precio
4. **Confluencia**: Si los diferentes vectores de analisis coinciden o divergen
5. **Recomendacion**: BUY / SELL / WAIT con niveles especificos de entrada, SL y TP
6. **Gestion de riesgo**: Tamano de posicion sugerido, puntos de invalidacion
7. **Nivel de confianza**: Alta / Media / Baja con justificacion
8. **Expiracion**: Tiempo estimado para que la operacion llegue a TP o se invalide. Para la temporalidad ${timeframe}, sugiere una expiracion de aproximadamente ${expirationGuide[timeframe] || '3 dias'}.

REGLAS:
- Responde SIEMPRE en espanol
- Se especifico con niveles de precio usando el formato: Entrada: $XX,XXX | Stop Loss: $XX,XXX | Take Profit: $XX,XXX
- Menciona siempre el Risk:Reward (ej: Risk:Reward 1:2.5)
- Indica siempre el nivel de confianza: Alta, Media o Baja
- Sugiere siempre un tiempo de expiracion para la recomendacion
- Si los datos son simulados, indicalo como advertencia
- No inventes datos que no tengas
- Usa formato markdown para estructurar tu respuesta
- Se conciso pero completo
- Si el usuario pregunta algo especifico, respondele directamente`;

  return prompt;
}
