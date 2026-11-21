import designTokens from "../../../design-tokens.json";

export const design = designTokens;
export type DesignTokens = typeof designTokens;

export const mobilePalette = {
  light: {
    background: design.colors.light.canvas,
    surface: design.colors.light.surface,
    surfaceRaised: design.colors.light.surfaceRaised,
    text: design.colors.light.text,
    muted: design.colors.light.muted,
    border: design.colors.light.border,
    primary: design.brand.primary,
    primaryPressed: design.brand.primaryPressed,
    primarySoft: design.brand.primarySoft,
    onPrimary: design.brand.onPrimary,
    success: design.colors.light.success,
    successSoft: design.colors.light.successSoft,
    warning: design.colors.light.warning,
    warningSoft: design.colors.light.warningSoft,
    danger: design.colors.light.danger,
    dangerSoft: design.colors.light.dangerSoft,
    info: design.colors.light.info,
    infoSoft: design.colors.light.infoSoft,
  },
  dark: {
    background: design.colors.dark.canvas,
    surface: design.colors.dark.surface,
    surfaceRaised: design.colors.dark.surfaceRaised,
    text: design.colors.dark.text,
    muted: design.colors.dark.muted,
    border: design.colors.dark.border,
    primary: design.brand.dark.primary,
    primaryPressed: design.brand.dark.primaryPressed,
    primarySoft: design.brand.dark.primarySoft,
    onPrimary: design.brand.dark.onPrimary,
    success: design.colors.dark.success,
    successSoft: design.colors.dark.successSoft,
    warning: design.colors.dark.warning,
    warningSoft: design.colors.dark.warningSoft,
    danger: design.colors.dark.danger,
    dangerSoft: design.colors.dark.dangerSoft,
    info: design.colors.dark.info,
    infoSoft: design.colors.dark.infoSoft,
  },
} as const;

export const spacing = design.spacing;
export const radius = design.radius;
export const typeScale = design.typography;
export const motion = design.motion;
