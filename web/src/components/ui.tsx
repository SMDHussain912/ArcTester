import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  disabled,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  const classes = [
    "ds-button",
    `ds-button--${variant}`,
    `ds-button--${size}`,
    fullWidth ? "ds-button--full" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button
      {...props}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="ds-button__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

export function Card({ padding = "md", className = "", children, ...props }: CardProps) {
  return (
    <div {...props} className={[`ds-card ds-card--padding-${padding}`, className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

export type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant = "neutral", className = "", children, ...props }: BadgeProps) {
  return (
    <span {...props} className={[`ds-badge ds-badge--${variant}`, className].filter(Boolean).join(" ")}>
      {children}
    </span>
  );
}

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  label: string;
  showValue?: boolean;
}

export function ProgressBar({ value, label, showValue = false, className = "", ...props }: ProgressBarProps) {
  const percent = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const rounded = Math.round(percent);

  return (
    <div className={[`ds-progress-wrap`, className].filter(Boolean).join(" ")} {...props}>
      <div
        className="ds-progress"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={`${rounded}%`}
      >
        <div className="ds-progress__value" style={{ width: `${percent}%` }} />
      </div>
      {showValue && <span className="ds-progress__label">{rounded}%</span>}
    </div>
  );
}
