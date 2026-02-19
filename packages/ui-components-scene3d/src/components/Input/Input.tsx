import { useCallback, type ChangeEvent } from 'react';
import type { InputProps } from '@mhersztowski/ui-core';
import styles from './Input.module.css';

export function Input({
  label,
  placeholder,
  value,
  defaultValue,
  onChange,
  error,
  helperText,
  disabled = false,
  type = 'text',
  className,
  style,
}: InputProps) {
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange?.(e.target.value);
    },
    [onChange],
  );

  const inputClassName = [
    styles['input'],
    error ? styles['inputError'] : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`${styles['wrapper']} ${className ?? ''}`} style={style}>
      {label && <label className={styles['label']}>{label}</label>}
      <input
        className={inputClassName}
        type={type}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        disabled={disabled}
      />
      {error && <span className={styles['errorText']}>{error}</span>}
      {!error && helperText && (
        <span className={styles['helperText']}>{helperText}</span>
      )}
    </div>
  );
}
