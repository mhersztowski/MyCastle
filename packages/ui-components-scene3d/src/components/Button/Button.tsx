import type { ButtonProps } from '@mhersztowski/ui-core';
import styles from './Button.module.css';

export function Button({
  variant = 'filled',
  size = 'md',
  disabled = false,
  loading = false,
  startIcon,
  endIcon,
  fullWidth = false,
  children,
  onClick,
  className,
  style,
}: ButtonProps) {
  const classNames = [
    styles['button'],
    styles[variant],
    size !== 'md' ? styles[size] : '',
    disabled ? styles['disabled'] : '',
    fullWidth ? styles['fullWidth'] : '',
    loading ? styles['loading'] : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classNames}
      style={style}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && <span className={styles['spinner']} />}
      {startIcon && <span>{startIcon}</span>}
      {children}
      {endIcon && <span>{endIcon}</span>}
    </button>
  );
}
