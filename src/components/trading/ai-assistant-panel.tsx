'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Send,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Trash2,
  Zap,
  AlertTriangle,
  Pin,
  Check,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import type { TechnicalAnalysis, PatternAnalysis, VolumeAnalysis, NewsAnalysis, SentimentAnalysis, MacroAnalysis, ConfluenceResult, MultiTimeframeResult } from '@/lib/types';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });

interface TradeRecommendation {
  symbol: string;
  timeframe: string;
  direction: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confidence: string;
  confluenceScore?: number;
  expiresAt: string;
  aiAnalysis: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  marketSummary?: {
    symbol: string;
    price: number;
    change: number;
    confluenceDirection?: string;
    confluenceScore?: number;
    riskReward?: number;
  };
  tradeRecommendation?: TradeRecommendation | null;
  isRegistered?: boolean;
}

const QUICK_PROMPTS = [
  { label: 'Analizar ahora', icon: Zap, prompt: '' },
  { label: 'Debo comprar?', prompt: 'Debo entrar en posicion de compra ahora? Cual es el riesgo?' },
  { label: 'Debo vender?', prompt: 'Debo vender mi posicion actual? Hay senales de reversion?' },
  { label: 'Soportes/Resistencias', prompt: 'Cuales son los niveles clave de soporte y resistencia?' },
  { label: 'Gestion de riesgo', prompt: 'Como deberia gestionar el riesgo en esta operacion? Tamano de posicion y SL optimo.' },
];

interface AIAssistantPanelProps {
  technical?: TechnicalAnalysis | null;
  patterns?: PatternAnalysis | null;
  volume?: VolumeAnalysis | null;
  news?: NewsAnalysis | null;
  sentiment?: SentimentAnalysis | null;
  macro?: MacroAnalysis | null;
  confluence?: ConfluenceResult | null;
  multiTimeframe?: MultiTimeframeResult | null;
  currentPrice?: number;
  priceChange?: number;
}

export function AIAssistantPanel({
  technical,
  patterns,
  volume,
  news,
  sentiment,
  macro,
  confluence,
  multiTimeframe,
  currentPrice = 0,
  priceChange = 0,
}: AIAssistantPanelProps) {
  const { selectedSymbol, timeframe } = useAppStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [registeringId, setRegisteringId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const hasAnalysis = !!(technical || patterns || volume || confluence);

  const registerTrade = useCallback(async (msgIndex: number, trade: TradeRecommendation) => {
    setRegisteringId(msgIndex);
    try {
      const res = await fetch('/api/ai-trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trade),
      });
      if (!res.ok) throw new Error('Failed to register');
      setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, isRegistered: true } : m));
    } catch {
      // Silently fail
    }
    setRegisteringId(null);
  }, []);

  const sendMessage = useCallback(async (customPrompt?: string) => {
    const userMessage = customPrompt || input.trim();
    if (!userMessage || isLoading) return;

    setInput('');
    setIsLoading(true);

    const userChat: ChatMessage = { role: 'user', content: userMessage, timestamp: Date.now() };
    setMessages(prev => [...prev, userChat]);

    try {
      const conversationHistory = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const analysisData = hasAnalysis ? {
        currentPrice, priceChange,
        technical: technical ?? null, patterns: patterns ?? null, volume: volume ?? null,
        news: news ?? null, sentiment: sentiment ?? null, macro: macro ?? null,
        confluence: confluence ?? null, multiTimeframe: multiTimeframe ?? null,
      } : null;

      const res = await fetch('/api/ai-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, timeframe, question: userMessage, conversationHistory, analysisData }),
      });

      if (!res.ok) {
        let errorDetail = `HTTP ${res.status}`;
        try { const errData = await res.json(); errorDetail = errData.details || errData.error || errorDetail; } catch { /* keep default */ }
        throw new Error(errorDetail);
      }

      const data = await res.json();
      const assistantChat: ChatMessage = {
        role: 'assistant',
        content: data.analysis,
        timestamp: Date.now(),
        marketSummary: data.marketSummary,
        tradeRecommendation: data.tradeRecommendation,
      };
      setMessages(prev => [...prev, assistantChat]);
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Error al conectar con la IA.';
      setMessages(prev => [...prev, { role: 'assistant', content: `${errorText} Intenta de nuevo.`, timestamp: Date.now() }]);
    }

    setIsLoading(false);
  }, [input, isLoading, selectedSymbol, timeframe, messages, hasAnalysis, technical, patterns, volume, news, sentiment, macro, confluence, multiTimeframe, currentPrice, priceChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }, [sendMessage]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const getDirectionIcon = (dir?: string) => {
    if (dir === 'LONG') return <TrendingUp className="w-3 h-3 text-emerald-400" />;
    if (dir === 'SHORT') return <TrendingDown className="w-3 h-3 text-red-400" />;
    return <Minus className="w-3 h-3 text-yellow-400" />;
  };

  const getDirectionColor = (dir?: string) => {
    if (dir === 'LONG') return 'text-emerald-400';
    if (dir === 'SHORT') return 'text-red-400';
    return 'text-yellow-400';
  };

  const getDirectionLabel = (dir?: string) => {
    if (dir === 'LONG') return 'ALCISTA';
    if (dir === 'SHORT') return 'BAJISTA';
    return 'NEUTRAL';
  };

  return (
    <div className="flex flex-col h-full" suppressHydrationWarning>
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-300">TradeIQ AI</p>
            <p className="text-[9px] text-gray-500">Powered by GPT-4o</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Badge className="text-[8px] border-0 bg-violet-500/15 text-violet-400 px-1.5">{selectedSymbol}</Badge>
          <Badge className="text-[8px] border-0 bg-white/5 text-gray-400 px-1.5">{timeframe}</Badge>
          {hasAnalysis ? (
            <Badge className="text-[8px] border-0 bg-emerald-500/15 text-emerald-400 px-1.5">Datos listos</Badge>
          ) : (
            <Badge className="text-[8px] border-0 bg-yellow-500/15 text-yellow-400 px-1.5">Sin analisis</Badge>
          )}
          {messages.length > 0 && (
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-gray-500 hover:text-gray-300" onClick={() => setMessages([])}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Chat Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-3 mb-2 min-h-0 pr-0.5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-6 px-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-violet-400" />
            </div>
            <p className="text-xs font-semibold text-gray-300 mb-1">Asistente de Trading con IA</p>
            <p className="text-[10px] text-gray-500 mb-4 max-w-[200px]">
              {hasAnalysis ? 'Usa los datos del analisis para recomendaciones inteligentes' : 'Ejecuta un analisis primero para que la IA tenga datos'}
            </p>
            <div className="space-y-1.5 w-full max-w-[220px]">
              {QUICK_PROMPTS.map((qp, i) => (
                <button key={i} onClick={() => sendMessage(qp.prompt || undefined)} disabled={isLoading}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-left transition-colors disabled:opacity-50">
                  {qp.icon ? <qp.icon className="w-3 h-3 text-violet-400 flex-shrink-0" /> : <Zap className="w-3 h-3 text-violet-400 flex-shrink-0" />}
                  <span className="text-[10px] text-gray-300">{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={`${msg.timestamp}-${i}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 ${
              msg.role === 'user' ? 'bg-violet-500/20 text-violet-100' : 'bg-white/5 text-gray-200'
            }`}>
              {/* Market summary badge */}
              {msg.role === 'assistant' && msg.marketSummary && (
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                  <div className="flex items-center gap-1">
                    {getDirectionIcon(msg.marketSummary.confluenceDirection)}
                    <span className={`text-[9px] font-bold ${getDirectionColor(msg.marketSummary.confluenceDirection)}`}>
                      {getDirectionLabel(msg.marketSummary.confluenceDirection)}
                    </span>
                  </div>
                  {msg.marketSummary.confluenceScore != null && (
                    <span className="text-[9px] font-mono text-gray-400">{msg.marketSummary.confluenceScore}%</span>
                  )}
                  {msg.marketSummary.riskReward != null && (
                    <span className="text-[9px] font-mono text-gray-400">R:R {msg.marketSummary.riskReward.toFixed(2)}</span>
                  )}
                </div>
              )}

              {/* Message content */}
              {msg.role === 'assistant' ? (
                <div className="text-[11px] leading-relaxed prose prose-invert prose-xs max-w-none
                  [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-1 [&_h1]:mt-2
                  [&_h2]:text-xs [&_h2]:font-bold [&_h2]:text-emerald-400 [&_h2]:mb-1 [&_h2]:mt-2
                  [&_h3]:text-[11px] [&_h3]:font-bold [&_h3]:text-gray-300 [&_h3]:mb-1 [&_h3]:mt-1.5
                  [&_p]:mb-1.5 [&_p]:text-gray-300
                  [&_ul]:mb-1.5 [&_ul]:ml-3 [&_ul]:list-disc
                  [&_ol]:mb-1.5 [&_ol]:ml-3 [&_ol]:list-decimal
                  [&_li]:text-[11px] [&_li]:text-gray-300 [&_li]:mb-0.5
                  [&_strong]:text-white [&_strong]:font-semibold
                  [&_code]:text-violet-300 [&_code]:bg-violet-500/10 [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px]
                  [&_blockquote]:border-l-2 [&_blockquote]:border-emerald-500/30 [&_blockquote]:pl-2 [&_blockquote]:text-gray-400
                " suppressHydrationWarning>
                  {mounted ? <ReactMarkdown>{msg.content}</ReactMarkdown> : <p>{msg.content}</p>}
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed">{msg.content}</p>
              )}

              {/* Register Trade Button */}
              {msg.role === 'assistant' && msg.tradeRecommendation && !msg.isRegistered && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <button
                    onClick={() => registerTrade(i, msg.tradeRecommendation!)}
                    disabled={registeringId === i}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md
                      bg-gradient-to-r from-emerald-600/80 to-teal-600/80 hover:from-emerald-600 hover:to-teal-600
                      text-white text-[10px] font-semibold transition-all disabled:opacity-50"
                  >
                    {registeringId === i ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Pin className="w-3 h-3" />
                    )}
                    Registrar Operacion
                  </button>
                </div>
              )}

              {/* Registered indicator */}
              {msg.role === 'assistant' && msg.isRegistered && (
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] text-emerald-400 font-medium">Operacion registrada en Tracker</span>
                </div>
              )}

              <p className="text-[8px] text-gray-600 mt-1" suppressHydrationWarning>{formatTime(msg.timestamp)}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white/5 rounded-lg px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3 h-3 text-violet-400 animate-spin" />
              <span className="text-[10px] text-gray-400">Pensando...</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick prompts */}
      {messages.length > 0 && (
        <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
          {QUICK_PROMPTS.slice(1).map((qp, i) => (
            <button key={i} onClick={() => sendMessage(qp.prompt)} disabled={isLoading}
              className="flex-shrink-0 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-[9px] text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50 whitespace-nowrap">
              {qp.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-1.5 pt-1 border-t border-white/5">
        <div className="flex-1 relative">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={hasAnalysis ? `Pregunta sobre ${selectedSymbol}...` : 'Ejecuta un analisis primero...'}
            disabled={isLoading} rows={1} suppressHydrationWarning
            className="w-full min-h-[32px] max-h-[80px] px-3 py-1.5 text-[11px] bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-violet-500/50 text-white placeholder-gray-500 resize-none disabled:opacity-50"
            style={{ lineHeight: '1.4' }} />
        </div>
        <Button size="sm" className="h-8 w-8 p-0 bg-violet-600 hover:bg-violet-700 rounded-lg flex-shrink-0"
          onClick={() => sendMessage()} disabled={isLoading || !input.trim()}>
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </Button>
      </div>

      <div className="flex items-center gap-1 mt-1.5">
        <AlertTriangle className="w-2.5 h-2.5 text-yellow-500/50 flex-shrink-0" />
        <p className="text-[8px] text-gray-600">IA asistencial. No es consejo financiero. Verifica siempre.</p>
      </div>
    </div>
  );
}
