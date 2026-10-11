import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

// Distinct hues with enough contrast on both light and dark backgrounds (the theme's chart tokens are greys).
const COLORS = ["oklch(0.58 0.17 255)", "oklch(0.68 0.15 155)", "oklch(0.74 0.15 75)", "oklch(0.62 0.2 25)", "oklch(0.58 0.16 310)"];

export interface Series {
  key: string;
  label: string;
}

/**
 * Stacked bars or lines. Values of `undefined` (suppressed cells) are not plotted: a suppressed
 * cell is never drawn as zero. The table beside each chart states "suppressed (under 5)".
 */
export function SeriesChart({ data, x, series, kind = "bar" }: { data: Array<Record<string, string | number | undefined>>; x: string; series: Series[]; kind?: "bar" | "line" }) {
  const config: ChartConfig = Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, color: COLORS[i % COLORS.length]! }]));
  return (
    <ChartContainer config={config} className="h-64 w-full">
      {kind === "bar" ? (
        <BarChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={x} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="a" fill={`var(--color-${s.key})`} isAnimationActive={false} />
          ))}
        </BarChart>
      ) : (
        <LineChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={x} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} stroke={`var(--color-${s.key})`} dot connectNulls={false} isAnimationActive={false} />
          ))}
        </LineChart>
      )}
    </ChartContainer>
  );
}
