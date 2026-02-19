import type { SettingsPanelProps } from '@mhersztowski/ui-core';
import { useToggle } from '@mhersztowski/ui-core';
import styles from './SettingsPanel.module.css';

export function SettingsPanel({ className }: SettingsPanelProps) {
  const [showGrid, toggleGrid] = useToggle(true);
  const [showAxes, toggleAxes] = useToggle(false);
  const [wireframe, toggleWireframe] = useToggle(false);
  const [shadows, toggleShadows] = useToggle(true);

  return (
    <div className={`${styles['panel']} ${className ?? ''}`}>
      <div className={styles['header']}>Settings</div>

      <div className={styles['section']}>
        <div className={styles['sectionTitle']}>Viewport</div>

        <div className={styles['settingRow']}>
          <span className={styles['settingLabel']}>Show Grid</span>
          <button
            className={`${styles['toggle']} ${showGrid ? styles['toggleActive'] : ''}`}
            onClick={toggleGrid}
          />
        </div>

        <div className={styles['settingRow']}>
          <span className={styles['settingLabel']}>Show Axes</span>
          <button
            className={`${styles['toggle']} ${showAxes ? styles['toggleActive'] : ''}`}
            onClick={toggleAxes}
          />
        </div>

        <div className={styles['settingRow']}>
          <span className={styles['settingLabel']}>Wireframe</span>
          <button
            className={`${styles['toggle']} ${wireframe ? styles['toggleActive'] : ''}`}
            onClick={toggleWireframe}
          />
        </div>

        <div className={styles['settingRow']}>
          <span className={styles['settingLabel']}>Shadows</span>
          <button
            className={`${styles['toggle']} ${shadows ? styles['toggleActive'] : ''}`}
            onClick={toggleShadows}
          />
        </div>
      </div>
    </div>
  );
}
