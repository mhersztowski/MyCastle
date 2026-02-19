import { useCallback, useEffect, type MouseEvent } from 'react';
import type { DialogProps } from '@mhersztowski/ui-core';
import styles from './Dialog.module.css';

export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  maxWidth = 'md',
  className,
}: DialogProps) {
  const handleOverlayClick = useCallback(
    (e: MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles['overlay']} onClick={handleOverlayClick}>
      <div
        className={`${styles['dialog']} ${styles[maxWidth]} ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {title && (
          <div className={styles['header']}>
            <h2 className={styles['title']}>{title}</h2>
          </div>
        )}
        <div className={styles['body']}>{children}</div>
        {actions && <div className={styles['actions']}>{actions}</div>}
      </div>
    </div>
  );
}
