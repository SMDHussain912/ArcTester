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


type ProgressRingProps = {
  value: number | null;
  label: string;
  detail?: string;
  size?: number;
};

export function AnalyticsProgressRing({ value, label, detail, size = 164 }: ProgressRingProps) {
  const normalized = value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const dash = normalized == null ? 0 : circumference * normalized / 100;
  return (
    <div className="analytics-progress-ring" role="img" aria-label={label + ": " + (normalized == null ? "no data" : Math.round(normalized) + "%")}>
      <svg width={size} height={size} viewBox="0 0 140 140" aria-hidden="true">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--border)" strokeWidth="12" />
        {normalized != null ? <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--accent)" strokeWidth="12" strokeLinecap="round" strokeDasharray={dash + " " + circumference} transform="rotate(-90 70 70)" /> : null}
        <text x="70" y="67" textAnchor="middle" className="analytics-ring-value">{normalized == null ? "—" : Math.round(normalized) + "%"}</text>
        <text x="70" y="87" textAnchor="middle" className="analytics-ring-caption">ACCURACY</text>
      </svg>
      <div className="analytics-ring-copy"><strong>{label}</strong>{detail ? <span>{detail}</span> : null}</div>
    </div>
  );
}

type DonutProps = {
  title: string;
  segments: { label: string; value: number; color: string }[];
  emptyMessage?: string;
};

export function AnalyticsDonutChart({ title, segments, emptyMessage = "No answer data yet." }: DonutProps) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;
  return (
    <section className="analytics-chart analytics-donut" aria-label={title}>
      <div className="panel-header"><h3>{title}</h3><strong>{total.toLocaleString()}</strong></div>
      {total > 0 ? (
        <div className="analytics-donut-layout">
          <svg viewBox="0 0 120 120" role="img" aria-label={segments.map(segment => segment.label + ": " + segment.value).join(", ")}>
            <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--border)" strokeWidth="15" />
            {segments.filter(segment => segment.value > 0).map(segment => {
              const length = segment.value / total * circumference;
              const offset = consumed;
              consumed += length;
              return <circle key={segment.label} cx="60" cy="60" r={radius} fill="none" stroke={segment.color} strokeWidth="15" strokeDasharray={length + " " + (circumference - length)} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />;
            })}
            <text x="60" y="57" textAnchor="middle" className="analytics-donut-total">{total.toLocaleString()}</text>
            <text x="60" y="72" textAnchor="middle" className="analytics-donut-caption">QUESTIONS</text>
          </svg>
          <div className="analytics-legend">{segments.map(segment => <span key={segment.label}><i style={{ background: segment.color }} />{segment.label}<strong>{segment.value.toLocaleString()}</strong></span>)}</div>
        </div>
      ) : <p className="muted">{emptyMessage}</p>}
    </section>
  );
}

export function AnalyticsLineChart({ title, description, items, maxValue = 100, formatValue = (value: number) => value + "%" , emptyMessage = "Not enough data to show a trend yet." }: BarChartProps) {
  const values = items.slice(-10);
  const max = Math.max(1, maxValue);
  const coords = values.map((item, index) => ({
    x: values.length <= 1 ? 280 : 28 + index * (504 / (values.length - 1)),
    y: 150 - Math.max(0, Math.min(max, item.value)) / max * 112,
    item,
  }));
  return (
    <section className="analytics-chart analytics-line-chart" aria-label={title}>
      <div className="panel-header"><h3>{title}</h3><span>{values.length ? formatValue(values[values.length - 1].value) : "—"}</span></div>
      {description ? <p className="muted">{description}</p> : null}
      {values.length ? (
        <div className="analytics-line-plot">
          <svg viewBox="0 0 560 190" role="img" aria-label={values.map(item => item.label + ": " + formatValue(item.value)).join(", ")}>
            {[0, 25, 50, 75, 100].map(tick => <g key={tick}><line x1="28" x2="532" y1={150 - tick / max * 112} y2={150 - tick / max * 112} stroke="var(--border)" strokeDasharray="4 5" /><text x="22" y={154 - tick / max * 112} textAnchor="end" className="analytics-axis-label">{tick}</text></g>)}
            <polyline points={coords.map(point => point.x + "," + point.y).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {coords.map((point, index) => <g key={point.item.label}><circle cx={point.x} cy={point.y} r="5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="3"><title>{point.item.label}: {formatValue(point.item.value)}</title></circle>{index === 0 || index === coords.length - 1 || coords.length <= 5 ? <text x={point.x} y="176" textAnchor="middle" className="analytics-axis-label">{point.item.label.replace("Attempt ", "#")}</text> : null}</g>)}
          </svg>
        </div>
      ) : <p className="muted">{emptyMessage}</p>}
    </section>
  );
}
