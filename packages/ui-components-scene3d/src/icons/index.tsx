import type { CSSProperties } from 'react';

interface IconProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

const defaults = { size: 16, color: 'currentColor' };

export function MoveIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M8 1L10 3.5H9V7H13V6L15 8L13 10V9H9V13H10L8 15L6 13H7V9H3V10L1 8L3 6V7H7V3.5H6L8 1Z" fill={color} />
    </svg>
  );
}

export function RotateIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M8 2C5.24 2 3 4.24 3 7H1L3.5 9.5L6 7H4C4 4.79 5.79 3 8 3C10.21 3 12 4.79 12 7C12 9.21 10.21 11 8 11C6.9 11 5.9 10.55 5.17 9.83L4.46 10.54C5.37 11.45 6.62 12 8 12C10.76 12 13 9.76 13 7C13 4.24 10.76 2 8 2Z" fill={color} />
    </svg>
  );
}

export function ScaleIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <rect x="2" y="2" width="5" height="5" rx="1" fill={color} fillOpacity="0.4" />
      <rect x="9" y="9" width="5" height="5" rx="1" fill={color} />
      <path d="M5 7V9H3V13H7V11H9V13H13V9H11V7H13V3H9V5H7V3H3V7H5Z" fill="none" stroke={color} strokeWidth="0.5" strokeOpacity="0.3" />
    </svg>
  );
}

export function CubeIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8 8L14 4.5M8 8L2 4.5M8 8V15" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function SphereIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="3" ry="6" stroke={color} strokeWidth="0.8" strokeOpacity="0.5" />
      <ellipse cx="8" cy="8" rx="6" ry="2.5" stroke={color} strokeWidth="0.8" strokeOpacity="0.5" />
    </svg>
  );
}

export function CylinderIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <ellipse cx="8" cy="4" rx="5" ry="2" stroke={color} strokeWidth="1.2" />
      <path d="M3 4V12C3 13.1 5.24 14 8 14C10.76 14 13 13.1 13 12V4" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function ConeIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M8 2L3 12H13L8 2Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      <ellipse cx="8" cy="12" rx="5" ry="2" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function PlaneIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M2 10L8 14L14 10L8 6L2 10Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function TorusIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <ellipse cx="8" cy="8" rx="6" ry="3" stroke={color} strokeWidth="1.2" />
      <ellipse cx="8" cy="8" rx="2.5" ry="1" stroke={color} strokeWidth="1" strokeOpacity="0.6" />
    </svg>
  );
}

export function PointLightIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <circle cx="8" cy="8" r="3" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.2" />
      <path d="M8 2V4M8 12V14M2 8H4M12 8H14M3.75 3.75L5.17 5.17M10.83 10.83L12.25 12.25M12.25 3.75L10.83 5.17M5.17 10.83L3.75 12.25" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function DirectionalLightIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <circle cx="8" cy="5" r="3" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.2" />
      <path d="M4 10L3 14M8 10V14M12 10L13 14" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function AmbientLightIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <circle cx="8" cy="8" r="5" stroke={color} strokeWidth="1.2" strokeDasharray="2 2" />
      <circle cx="8" cy="8" r="2" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1" />
    </svg>
  );
}

export function DeleteIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M5 3V2H11V3H14V5H2V3H5Z" fill={color} fillOpacity="0.8" />
      <path d="M3 5H13L12 14H4L3 5Z" stroke={color} strokeWidth="1.2" />
      <path d="M6 7V12M8 7V12M10 7V12" stroke={color} strokeWidth="0.8" strokeOpacity="0.5" />
    </svg>
  );
}

export function DuplicateIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <rect x="5" y="5" width="9" height="9" rx="1" stroke={color} strokeWidth="1.2" />
      <path d="M11 5V3C11 2.45 10.55 2 10 2H3C2.45 2 2 2.45 2 3V10C2 10.55 2.45 11 3 11H5" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function EyeIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M1 8C1 8 4 3 8 3C12 3 15 8 15 8C15 8 12 13 8 13C4 13 1 8 1 8Z" stroke={color} strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2" fill={color} />
    </svg>
  );
}

export function EyeOffIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M1 8C1 8 4 3 8 3C12 3 15 8 15 8C15 8 12 13 8 13C4 13 1 8 1 8Z" stroke={color} strokeWidth="1.2" strokeOpacity="0.4" />
      <path d="M2 14L14 2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function GridIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M1 4H15M1 8H15M1 12H15M4 1V15M8 1V15M12 1V15" stroke={color} strokeWidth="0.8" strokeOpacity="0.7" />
    </svg>
  );
}

export function FolderIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M2 4V12C2 12.55 2.45 13 3 13H13C13.55 13 14 12.55 14 12V6C14 5.45 13.55 5 13 5H8L6.5 3H3C2.45 3 2 3.45 2 4Z" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function CameraIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M2 5H10V12H2V5Z" stroke={color} strokeWidth="1.2" />
      <path d="M10 7L14 5V12L10 10" stroke={color} strokeWidth="1.2" />
    </svg>
  );
}

export function SaveIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M12 14H4C3.45 14 3 13.55 3 13V3C3 2.45 3.45 2 4 2H10L13 5V13C13 13.55 12.55 14 12 14Z" stroke={color} strokeWidth="1.2" />
      <path d="M5 2V6H10V2" stroke={color} strokeWidth="1" />
      <path d="M5 10H11" stroke={color} strokeWidth="1" />
      <path d="M5 12H9" stroke={color} strokeWidth="1" />
    </svg>
  );
}

export function ChevronRightIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M6 4L10 8L6 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDownIcon({ size = defaults.size, color = defaults.color, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
      <path d="M4 6L8 10L12 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
