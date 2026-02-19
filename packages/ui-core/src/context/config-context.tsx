import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { ThemeConfig, LibConfig, PartialLibConfig } from '../types';
import { defaultTheme } from '../theme/defaults';
import { deepMerge } from '../utils/deep-merge';

const ConfigContext = createContext<LibConfig | null>(null);

function themeToCustomProperties(theme: ThemeConfig): Record<string, string> {
  const vars: Record<string, string> = {};

  // Colors
  for (const [key, value] of Object.entries(theme.colors)) {
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    vars[`--mhersztowski-color-${cssKey}`] = value;
  }

  // Spacing
  for (const [key, value] of Object.entries(theme.spacing)) {
    vars[`--mhersztowski-spacing-${key}`] = value;
  }

  // Typography
  vars['--mhersztowski-font-family'] = theme.typography.fontFamily;
  for (const [key, value] of Object.entries(theme.typography.fontSize)) {
    vars[`--mhersztowski-font-size-${key}`] = value;
  }
  for (const [key, value] of Object.entries(theme.typography.fontWeight)) {
    vars[`--mhersztowski-font-weight-${key}`] = String(value);
  }
  for (const [key, value] of Object.entries(theme.typography.lineHeight)) {
    vars[`--mhersztowski-line-height-${key}`] = String(value);
  }

  // Shadows
  for (const [key, value] of Object.entries(theme.shadows)) {
    vars[`--mhersztowski-shadow-${key}`] = value;
  }

  // Border radius
  for (const [key, value] of Object.entries(theme.borderRadius)) {
    vars[`--mhersztowski-radius-${key}`] = value;
  }

  return vars;
}

export interface ConfigProviderProps {
  config?: PartialLibConfig;
  children: ReactNode;
}

export function ConfigProvider({ config, children }: ConfigProviderProps) {
  const mergedConfig = useMemo<LibConfig>(() => {
    const baseConfig: LibConfig = {
      theme: defaultTheme,
      locale: 'en',
      debug: false,
    };

    if (!config) return baseConfig;

    return deepMerge(
      baseConfig as unknown as Record<string, unknown>,
      config as unknown as Record<string, unknown>,
    ) as unknown as LibConfig;
  }, [config]);

  const cssVars = useMemo(
    () => themeToCustomProperties(mergedConfig.theme),
    [mergedConfig.theme],
  );

  return (
    <ConfigContext.Provider value={mergedConfig}>
      <div style={cssVars as CSSProperties}>{children}</div>
    </ConfigContext.Provider>
  );
}

export function useConfig(): LibConfig {
  const config = useContext(ConfigContext);
  if (!config) {
    return { theme: defaultTheme, locale: 'en', debug: false };
  }
  return config;
}

export function useTheme(): ThemeConfig {
  return useConfig().theme;
}

export function useDefaults(): ThemeConfig {
  return defaultTheme;
}
