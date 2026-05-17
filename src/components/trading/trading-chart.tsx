'use client';

import { useEffect, useRef, useMemo } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { Time, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { Candle } from '@/lib/types';

interface TradingChartProps {
  candles: Candle[];
  symbol: string;
}

export function TradingChart({ candles, symbol }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const prevSymbolRef = useRef<string>('');
  const prevCandleCountRef = useRef<number>(0);

  // Memoize chart data transformation
  const chartData = useMemo(() => {
    if (!candles.length) return { candles: [], volume: [] };

    const candlesMapped = candles.map(c => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeMapped = candles.map(c => ({
      time: c.time as Time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
    }));

    return { candles: candlesMapped, volume: volumeMapped };
  }, [candles]);

  // Create chart once on mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0f' },
        textColor: '#9ca3af',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(255, 255, 255, 0.1)', labelBackgroundColor: '#1a1a2e' },
        horzLine: { color: 'rgba(255, 255, 255, 0.1)', labelBackgroundColor: '#1a1a2e' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // Add volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Update data when candles or symbol change (without recreating chart)
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;
    if (chartData.candles.length === 0) return;

    const isSymbolChange = prevSymbolRef.current !== symbol;
    const isDataUpdate = !isSymbolChange && prevCandleCountRef.current > 0;

    candlestickSeriesRef.current.setData(chartData.candles);
    volumeSeriesRef.current.setData(chartData.volume);

    if (isSymbolChange) {
      // Symbol changed — fit chart to show all data
      chartRef.current?.timeScale().fitContent();
      prevSymbolRef.current = symbol;
    } else if (isDataUpdate) {
      // Data update (new candle or price change) — scroll to latest candle
      // Keep the user's zoom level but ensure the latest candle is visible
      const timeScale = chartRef.current?.timeScale();
      if (timeScale) {
        const logicalRange = timeScale.getVisibleLogicalRange();
        const maxLogicalIndex = chartData.candles.length - 1;

        // If the user is already viewing the latest area (within 5 candles),
        // auto-scroll to keep the latest visible
        if (logicalRange && logicalRange.to >= maxLogicalIndex - 5) {
          timeScale.scrollToRealTime();
        }
      }
    }

    prevCandleCountRef.current = chartData.candles.length;
  }, [chartData, symbol]);

  return (
    <div className="relative w-full h-full">
      <div ref={chartContainerRef} className="w-full h-full chart-container" />
      {candles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f]/80">
          <div className="text-gray-500 text-sm">Cargando datos del gráfico...</div>
        </div>
      )}
    </div>
  );
}
