import type { CSSProperties } from "react";

export type AnalyticsBarItem = { label: string; value: number; detail?: string };

type BarChartProps = {
  title: string;
  description?: string;
  items: AnalyticsBarItem[];
  maxValue?: number;
  formatValue?: (value: number) => string;
  emptyMessage?: string;
};

export function AnalyticsBarChart({
  title,
  description,
  items,
  maxValue,
  formatValue = (value) => String(value),
  emptyMessage = "Not enough data to show this chart yet.",
}: BarChartProps) {
  const scale = Math.max(1, maxValue ?? Math.max(0, ...items.map((item) => item.value)));
  return (
    <section className="analytics-chart panel" aria-label={title}>
      <div className="panel-header"><h3>{title}</h3></div>
      {description ? <p className="muted">{description}</p> : null}
      {items.length ? (
        <div className="analytics-bar-list">
          {items.map((item) => {
            const width = Math.max(0, Math.min(100, (item.value / scale) * 100));
            return (
              <div className="analytics-bar-row" key={item.label}>
                <div className="analytics-bar-label"><span>{item.label}</span><strong>{formatValue(item.value)}</strong></div>
                <div className="analytics-bar-track" role="img" aria-label={item.label + ": " + formatValue(item.value)}>
                  <span className="analytics-bar-fill" style={{ width: width + "%" } as CSSProperties} />
                </div>
                {item.detail ? <small className="muted">{item.detail}</small> : null}
              </div>
            );
          })}
        </div>
      ) : <p className="muted">{emptyMessage}</p>}
    </section>
  );
}

type StackedBarProps = {
  title: string;
  segments: { label: string; value: number; color: string }[];
  emptyMessage?: string;
};

export function AnalyticsStackedBar({ title, segments, emptyMessage = "No answer data yet." }: StackedBarProps) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  return (
    <section className="analytics-chart panel" aria-label={title}>
      <div className="panel-header"><h3>{title}</h3><strong>{total.toLocaleString()} questions</strong></div>
      {total ? (
        <>
          <div className="analytics-stacked-track" role="img" aria-label={segments.map(segment => segment.label + ": " + segment.value).join(", ")}>
            {segments.filter(segment => segment.value > 0).map(segment => (
              <span key={segment.label} title={segment.label + ": " + segment.value} style={{ width: (segment.value / total * 100) + "%", background: segment.color }} />
            ))}
          </div>
          <div className="analytics-legend">{segments.map(segment => <span key={segment.label}><i style={{ background: segment.color }} />{segment.label}<strong>{segment.value.toLocaleString()}</strong></span>)}</div>
        </>
      ) : <p className="muted">{emptyMessage}</p>}
    </section>
  );
}
