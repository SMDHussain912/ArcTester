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
  const source = variant === "mark" ? "/brand/aster-mark.svg" : "/brand/aster-mascot.svg";
  const imageProps: ImgHTMLAttributes<HTMLImageElement> = {
    src: source,
    alt: decorative ? "" : alt ?? "Aster, the ArcTester study owl",
    width: size,
    height: size,
    decoding: "async",
    ...(decorative ? { "aria-hidden": true } : {}),
    ...(className ? { className } : {}),
  };
  return <img {...imageProps} />;
}
