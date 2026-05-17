'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import type { Candle } from '@/lib/types';

interface TradingChartProps {
  candles: Candle[];
  symbol: string;
}

export function TradingChart({ candles, symbol: _symbol }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  const initChart = useCallback(() => {
    if (!chartContainerRef.current) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

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

    // Set data
    if (candles.length > 0) {
      const chartData = candles.map(c => ({
        time: c.time as number,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const volumeData = candles.map(c => ({
        time: c.time as number,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
      }));

      candlestickSeries.setData(chartData);
      volumeSeries.setData(volumeData);
      chart.timeScale().fitContent();
    }

    chartRef.current = chart;

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [candles]);

  useEffect(() => {
    const cleanup = initChart();
    return () => {
      cleanup?.();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [initChart]);

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
