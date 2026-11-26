import type { ImgHTMLAttributes } from "react";

export type ArcTesterMascotVariant = "mascot" | "mark";

interface ArcTesterMascotProps {
  size?: number;
  variant?: ArcTesterMascotVariant;
  alt?: string;
  decorative?: boolean;
  className?: string;
}

export default function ArcTesterMascot({ size = 112, variant = "mascot", alt, decorative = false, className }: ArcTesterMascotProps) {
  if (variant === "mark") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 96 96"
        width={size}
        height={size}
        className={className}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : alt ?? "ArcTester owl mark"}
        aria-hidden={decorative ? true : undefined}
        focusable="false"
      >
        <rect width="96" height="96" rx="25" fill="#3159D8" />
        <path d="M18 39L13 18q-1-5 5-2l21 15M78 39l5-21q1-5-5-2L57 47" fill="#8FB1FF" stroke="#FFFFFF" strokeWidth="3" strokeLinejoin="round" />
        <path d="M18 47c0-22 13-35 30-35s30 13 30 35v20c0 14-13 22-30 22S18 81 18 67z" fill="#8FB1FF" stroke="#FFFFFF" strokeWidth="3" />
        <ellipse cx="35" cy="47" rx="14" ry="15" fill="#FFFFFF" />
        <ellipse cx="61" cy="47" rx="14" ry="15" fill="#FFFFFF" />
        <circle cx="39" cy="49" r="6" fill="#172033" />
        <circle cx="57" cy="49" r="6" fill="#172033" />
        <path d="M48 57l-8 9 8 5 8-5z" fill="#FBBF24" stroke="#D97706" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  const imageProps: ImgHTMLAttributes<HTMLImageElement> = {
    src: "/brand/aster-mascot.svg",
    alt: decorative ? "" : alt ?? "Aster, the ArcTester study owl",
    width: size,
    height: size,
    decoding: "async",
    ...(decorative ? { "aria-hidden": true } : {}),
    ...(className ? { className } : {}),
  };
  return <img {...imageProps} />;
}
