import { defaultTheme } from './defaults';

describe('defaultTheme', () => {
  it('should be a defined object', () => {
    expect(defaultTheme).toBeTypeOf('object');
    expect(defaultTheme).not.toBeNull();
  });

  it('should expose all top-level theme sections', () => {
    expect(Object.keys(defaultTheme).sort()).toEqual(
      ['borderRadius', 'colors', 'shadows', 'spacing', 'typography'].sort(),
    );
  });

  describe('colors', () => {
    const requiredColors = [
      'primary',
      'primaryVariant',
      'secondary',
      'secondaryVariant',
      'background',
      'surface',
      'error',
      'onPrimary',
      'onSecondary',
      'onBackground',
      'onSurface',
      'onError',
      'border',
      'divider',
    ];

    it('should define every required color key', () => {
      for (const key of requiredColors) {
        expect(defaultTheme.colors).toHaveProperty(key);
      }
    });

    it('should use hex color string values', () => {
      for (const value of Object.values(defaultTheme.colors)) {
        expect(value).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      }
    });

    it('should be a dark theme (dark background, light foreground)', () => {
      expect(defaultTheme.colors.background).toBe('#1a1a1a');
      expect(defaultTheme.colors.onBackground).toBe('#cccccc');
    });
  });

  describe('spacing', () => {
    it('should define xs..xl with px units', () => {
      expect(defaultTheme.spacing).toEqual({
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
      });
    });
  });

  describe('typography', () => {
    it('should define a fontFamily string', () => {
      expect(typeof defaultTheme.typography.fontFamily).toBe('string');
      expect(defaultTheme.typography.fontFamily.length).toBeGreaterThan(0);
    });

    it('should define fontSize scale keys', () => {
      expect(Object.keys(defaultTheme.typography.fontSize).sort()).toEqual(
        ['lg', 'md', 'sm', 'xl', 'xs', 'xxl'].sort(),
      );
    });

    it('should define numeric fontWeight values', () => {
      const weights = defaultTheme.typography.fontWeight;
      expect(weights.light).toBe(300);
      expect(weights.regular).toBe(400);
      expect(weights.medium).toBe(500);
      expect(weights.bold).toBe(600);
      for (const w of Object.values(weights)) {
        expect(typeof w).toBe('number');
      }
    });

    it('should define numeric lineHeight values', () => {
      const lh = defaultTheme.typography.lineHeight;
      expect(lh.tight).toBe(1.2);
      expect(lh.normal).toBe(1.4);
      expect(lh.relaxed).toBe(1.6);
    });
  });

  describe('shadows', () => {
    it('should define sm/md/lg shadow strings', () => {
      expect(Object.keys(defaultTheme.shadows).sort()).toEqual(['lg', 'md', 'sm']);
      for (const value of Object.values(defaultTheme.shadows)) {
        expect(typeof value).toBe('string');
      }
    });
  });

  describe('borderRadius', () => {
    it('should define sm/md/lg/full radius values', () => {
      expect(defaultTheme.borderRadius).toEqual({
        sm: '3px',
        md: '6px',
        lg: '12px',
        full: '9999px',
      });
    });
  });
});
