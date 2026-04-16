// ── ANSI helpers (no external deps) ─────────────────────────────────────────

const ESC = '\x1b[';

export const c = {
  reset:   `${ESC}0m`,
  bold:    `${ESC}1m`,
  dim:     `${ESC}2m`,
  // foreground
  black:   `${ESC}30m`,
  red:     `${ESC}31m`,
  green:   `${ESC}32m`,
  yellow:  `${ESC}33m`,
  blue:    `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan:    `${ESC}36m`,
  white:   `${ESC}37m`,
  gray:    `${ESC}90m`,
  // bright
  bRed:    `${ESC}91m`,
  bGreen:  `${ESC}92m`,
  bYellow: `${ESC}93m`,
  bBlue:   `${ESC}94m`,
  bMagenta:`${ESC}95m`,
  bCyan:   `${ESC}96m`,
  bWhite:  `${ESC}97m`,
};

export const paint = (color: string, text: string) => `${color}${text}${c.reset}`;

export const bold   = (t: string) => paint(c.bold,    t);
export const dim    = (t: string) => paint(c.dim,     t);
export const green  = (t: string) => paint(c.bGreen,  t);
export const red    = (t: string) => paint(c.bRed,    t);
export const yellow = (t: string) => paint(c.bYellow, t);
export const blue   = (t: string) => paint(c.bBlue,   t);
export const cyan   = (t: string) => paint(c.bCyan,   t);
export const magenta= (t: string) => paint(c.bMagenta,t);
export const gray   = (t: string) => paint(c.gray,    t);

export const tick  = green('✓');
export const arrow = cyan('→');
export const bullet= dim('•');

// ── Section header ────────────────────────────────────────────────────────────

export function section(emoji: string, title: string): void {
  const line = '─'.repeat(60);
  console.log();
  console.log(paint(c.bCyan, line));
  console.log(`${emoji}  ${paint(c.bold + c.bWhite, title)}`);
  console.log(paint(c.bCyan, line));
}

export function sub(title: string): void {
  console.log(`\n${paint(c.yellow, '▶')} ${paint(c.bold, title)}`);
}

export function log(label: string, value: unknown): void {
  console.log(`  ${paint(c.cyan, label.padEnd(20))} ${formatValue(value)}`);
}

function formatValue(v: unknown): string {
  if (typeof v === 'boolean')  return v ? green('true')  : red('false');
  if (typeof v === 'number')   return yellow(String(v));
  if (typeof v === 'string')   return `"${green(v)}"`;
  if (v === null)              return gray('null');
  if (v === undefined)         return gray('undefined');
  if (Array.isArray(v))        return cyan(JSON.stringify(v));
  return cyan(JSON.stringify(v));
}

export function ok(msg: string): void {
  console.log(`  ${tick} ${msg}`);
}

export function info(msg: string): void {
  console.log(`  ${bullet} ${gray(msg)}`);
}

export function signal(emitter: string, sigName: string, ...args: unknown[]): void {
  const argsStr = args.length ? ` ${dim('(')}${args.map(a => yellow(String(a))).join(', ')}${dim(')')}` : '';
  console.log(`  ${magenta('⚡')} ${cyan(emitter)}${dim('.')}${magenta(sigName)}${argsStr}`);
}

export function transition(from: string, to: string, event: string): void {
  console.log(`  ${yellow('◈')} ${bold(from)} ${gray('─[')}${cyan(event)}${gray(']→')} ${bold(to)}`);
}

export function tree(lines: string[]): void {
  for (const line of lines) console.log(`  ${gray('│')} ${line}`);
}

// ── Timing ────────────────────────────────────────────────────────────────────

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function timestamp(): string {
  return gray(`[${new Date().toLocaleTimeString()}]`);
}
