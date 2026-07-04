import { render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ConfigProvider, useConfig, useTheme, useDefaults } from './config-context';
import { defaultTheme } from '../theme/defaults';

function getProviderDiv(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement;
}

describe('ConfigProvider', () => {
  it('should render its children', () => {
    const { getByText } = render(
      <ConfigProvider>
        <span>hello world</span>
      </ConfigProvider>,
    );
    expect(getByText('hello world')).toBeInTheDocument();
  });

  it('should wrap children in a div carrying CSS custom properties', () => {
    const { container } = render(
      <ConfigProvider>
        <span>child</span>
      </ConfigProvider>,
    );
    const div = getProviderDiv(container);
    expect(div.tagName).toBe('DIV');
    expect(div.style.getPropertyValue('--mhersztowski-color-primary')).toBe(
      defaultTheme.colors.primary,
    );
  });

  it('should convert camelCase color keys to kebab-case CSS variable names', () => {
    const { container } = render(
      <ConfigProvider>
        <span>child</span>
      </ConfigProvider>,
    );
    const div = getProviderDiv(container);
    // primaryVariant -> --mhersztowski-color-primary-variant
    expect(div.style.getPropertyValue('--mhersztowski-color-primary-variant')).toBe(
      defaultTheme.colors.primaryVariant,
    );
    expect(div.style.getPropertyValue('--mhersztowski-color-on-background')).toBe(
      defaultTheme.colors.onBackground,
    );
  });

  it('should emit spacing custom properties', () => {
    const { container } = render(
      <ConfigProvider>
        <span>child</span>
      </ConfigProvider>,
    );
    const div = getProviderDiv(container);
    expect(div.style.getPropertyValue('--mhersztowski-spacing-md')).toBe(
      defaultTheme.spacing.md,
    );
  });

  it('should emit typography custom properties (family, size, weight, line-height)', () => {
    const { container } = render(
      <ConfigProvider>
        <span>child</span>
      </ConfigProvider>,
    );
    const div = getProviderDiv(container);
    expect(div.style.getPropertyValue('--mhersztowski-font-family')).toBe(
      defaultTheme.typography.fontFamily,
    );
    expect(div.style.getPropertyValue('--mhersztowski-font-size-lg')).toBe(
      defaultTheme.typography.fontSize.lg,
    );
    // numeric values are stringified
    expect(div.style.getPropertyValue('--mhersztowski-font-weight-bold')).toBe(
      String(defaultTheme.typography.fontWeight.bold),
    );
    expect(div.style.getPropertyValue('--mhersztowski-line-height-normal')).toBe(
      String(defaultTheme.typography.lineHeight.normal),
    );
  });

  it('should emit shadow and radius custom properties', () => {
    const { container } = render(
      <ConfigProvider>
        <span>child</span>
      </ConfigProvider>,
    );
    const div = getProviderDiv(container);
    expect(div.style.getPropertyValue('--mhersztowski-shadow-md')).toBe(
      defaultTheme.shadows.md,
    );
    expect(div.style.getPropertyValue('--mhersztowski-radius-full')).toBe(
      defaultTheme.borderRadius.full,
    );
  });

  it('should apply a partial config override into the merged theme CSS variables', () => {
    const { container } = render(
      <ConfigProvider config={{ theme: { colors: { primary: '#ff0000' } } }}>
        <span>child</span>
      </ConfigProvider>,
    );
    const div = getProviderDiv(container);
    expect(div.style.getPropertyValue('--mhersztowski-color-primary')).toBe('#ff0000');
    // untouched color falls back to default
    expect(div.style.getPropertyValue('--mhersztowski-color-secondary')).toBe(
      defaultTheme.colors.secondary,
    );
  });
});

describe('useConfig', () => {
  it('should return default config when used outside a provider', () => {
    const { result } = renderHook(() => useConfig());
    expect(result.current.theme).toEqual(defaultTheme);
    expect(result.current.locale).toBe('en');
    expect(result.current.debug).toBe(false);
  });

  it('should return the provided merged config inside a provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider config={{ locale: 'pl', debug: true }}>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useConfig(), { wrapper });
    expect(result.current.locale).toBe('pl');
    expect(result.current.debug).toBe(true);
    // theme still present from defaults
    expect(result.current.theme.colors.primary).toBe(defaultTheme.colors.primary);
  });

  it('should default locale/debug when provider has no config prop', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useConfig(), { wrapper });
    expect(result.current.locale).toBe('en');
    expect(result.current.debug).toBe(false);
    expect(result.current.theme).toEqual(defaultTheme);
  });
});

describe('useTheme', () => {
  it('should return the default theme outside a provider', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current).toEqual(defaultTheme);
  });

  it('should return the merged theme inside a provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider config={{ theme: { colors: { primary: '#123456' } } }}>
        {children}
      </ConfigProvider>
    );
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.colors.primary).toBe('#123456');
    expect(result.current.colors.secondary).toBe(defaultTheme.colors.secondary);
  });
});

describe('useDefaults', () => {
  it('should always return the immutable default theme', () => {
    const { result } = renderHook(() => useDefaults());
    expect(result.current).toBe(defaultTheme);
  });

  it('should return defaults even inside a customized provider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider config={{ theme: { colors: { primary: '#000000' } } }}>
        {children}
      </ConfigProvider>
    );
    const { result } = renderHook(() => useDefaults(), { wrapper });
    expect(result.current).toBe(defaultTheme);
  });
});
