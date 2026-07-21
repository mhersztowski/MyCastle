/**
 * "My Elements" — a personal, per-user library of electronic parts the user
 * catalogues by hand (name, type, value, package, manufacturer/LCSC part
 * numbers). Independent of the placed-schematic components: this is a reference
 * inventory, persisted once per user (not per project) so it follows the user
 * across every electronics schematic.
 *
 * Stored in the VFS at `/users/{userId}/MyElements.json`.
 */

import { userRootDir, readFileAt, writeFileAt } from '../vfs/cadProjectApi';

// ── model ──────────────────────────────────────────────────────────────────────

/** A single catalogued part in the user's personal library. */
export interface MyElement {
  id: string;
  /** Free display name, e.g. "10k pull-up" or "Main buck regulator". */
  name: string;
  /** Longer free-text notes about the part. */
  description: string;
  /** Component type from {@link COMPONENT_TYPES} (free text allowed too). */
  componentType: string;
  /** Numeric/text value, e.g. "10", "4.7", "100" — paired with {@link valueUnit}. */
  value: string;
  /** Unit for {@link value} from {@link VALUE_UNITS}, e.g. "Ω", "µF". */
  valueUnit: string;
  /** Package / footprint from {@link PACKAGE_TYPES}, e.g. "0805", "SOT-23". */
  packageType: string;
  /** Manufacturer part number (MPN), free string. */
  mpn: string;
  /** LCSC part number — starts with "C" followed by digits, e.g. "C25804". */
  lcsc: string;
  /** Category name this element belongs to (see {@link Category}). Empty = uncategorised. */
  category: string;
  /** Stock quantity on hand for this part. */
  quantity: number;
}

/**
 * A user-defined grouping for elements. The list is displayed grouped by
 * category, ordered by ascending {@link weight} (lower weight shown first).
 */
export interface Category {
  name: string;
  /** Ordering weight — categories are listed by ascending weight. */
  weight: number;
}

/** The whole personal library: ordered categories plus catalogued elements. */
export interface MyElementsLibrary {
  categories: Category[];
  elements: MyElement[];
}

// ── catalogs ────────────────────────────────────────────────────────────────────

/**
 * Full catalogue of electronic component types. Used as Autocomplete options;
 * the user may still type a custom value not in this list.
 */
export const COMPONENT_TYPES: string[] = [
  'Resistor',
  'Resistor Network / Array',
  'Potentiometer',
  'Trimmer / Rheostat',
  'Thermistor (NTC)',
  'Thermistor (PTC)',
  'Varistor (MOV)',
  'Photoresistor (LDR)',
  'Capacitor (Ceramic)',
  'Capacitor (Electrolytic)',
  'Capacitor (Tantalum)',
  'Capacitor (Film)',
  'Capacitor (Supercap)',
  'Inductor',
  'Ferrite Bead',
  'Common-Mode Choke',
  'Transformer',
  'Crystal',
  'Oscillator',
  'Resonator',
  'Diode (Rectifier)',
  'Diode (Schottky)',
  'Diode (Zener)',
  'Diode (TVS / ESD)',
  'Bridge Rectifier',
  'LED',
  'LED (RGB)',
  'Photodiode',
  'Phototransistor',
  'Optocoupler',
  'Transistor (BJT NPN)',
  'Transistor (BJT PNP)',
  'MOSFET (N-Channel)',
  'MOSFET (P-Channel)',
  'JFET',
  'IGBT',
  'Transistor Array',
  'Voltage Regulator (Linear/LDO)',
  'Voltage Regulator (Switching)',
  'Voltage Reference',
  'Op-Amp',
  'Comparator',
  'Instrumentation Amp',
  'ADC',
  'DAC',
  'Microcontroller',
  'Microprocessor',
  'FPGA / CPLD',
  'Logic Gate IC',
  'Shift Register',
  'Memory (EEPROM/Flash)',
  'Memory (RAM)',
  'Real-Time Clock (RTC)',
  'Motor Driver',
  'Gate Driver',
  'Power Management IC (PMIC)',
  'Interface IC (UART/USB/CAN)',
  'RF / Wireless Module',
  'Sensor (Temperature)',
  'Sensor (Humidity)',
  'Sensor (Pressure)',
  'Sensor (IMU / Accel / Gyro)',
  'Sensor (Hall / Magnetic)',
  'Sensor (Light)',
  'Sensor (Current)',
  'Sensor (Gas)',
  'Sensor (Other)',
  'Relay',
  'Solid-State Relay',
  'Switch',
  'Push Button',
  'Rotary Encoder',
  'DIP Switch',
  'Connector / Header',
  'USB Connector',
  'Battery / Holder',
  'Fuse',
  'PTC Resettable Fuse',
  'Buzzer / Speaker',
  'Microphone',
  'Antenna',
  'Display (LCD)',
  'Display (OLED)',
  'Display (7-Segment)',
  'Test Point',
  'Jumper',
  'Mounting Hole',
  'Other',
];

/**
 * Full catalogue of value units, grouped by physical quantity. The user picks
 * one (or types a custom unit). "—" means the part is dimensionless / N/A.
 */
export const VALUE_UNITS: string[] = [
  '—',
  // Resistance
  'mΩ', 'Ω', 'kΩ', 'MΩ',
  // Capacitance
  'pF', 'nF', 'µF', 'mF', 'F',
  // Inductance
  'nH', 'µH', 'mH', 'H',
  // Voltage
  'µV', 'mV', 'V', 'kV',
  // Current
  'µA', 'mA', 'A',
  // Power
  'µW', 'mW', 'W', 'kW',
  // Frequency
  'Hz', 'kHz', 'MHz', 'GHz',
  // Charge / misc
  'Ah', 'mAh', 'C',
  '%', 'ppm', 'dB', 'K', '°C',
];

/**
 * Full catalogue of standard packages/footprints — SMD chip sizes, SMD
 * semiconductor/IC packages, and THT packages. Used as Autocomplete options.
 */
export const PACKAGE_TYPES: string[] = [
  // ── SMD chip (resistors / capacitors / inductors, imperial code) ──
  '01005', '0201', '0402', '0603', '0805', '1206', '1210', '1812', '2010', '2512',
  // MELF (cylindrical SMD)
  'MELF', 'MiniMELF', 'MicroMELF',
  // Tantalum EIA case codes
  'Tantalum A (3216)', 'Tantalum B (3528)', 'Tantalum C (6032)', 'Tantalum D (7343)',
  // SMD electrolytic can (diameter)
  'SMD Electrolytic 4mm', 'SMD Electrolytic 5mm', 'SMD Electrolytic 6.3mm', 'SMD Electrolytic 8mm', 'SMD Electrolytic 10mm',
  // ── SMD diode packages ──
  'SOD-80', 'SOD-123', 'SOD-323', 'SOD-523', 'SOD-723', 'SMA (DO-214AC)', 'SMB (DO-214AA)', 'SMC (DO-214AB)',
  // ── SMD transistor / small-signal ──
  'SOT-23', 'SOT-23-3', 'SOT-23-5', 'SOT-23-6', 'SOT-89', 'SOT-143', 'SOT-223',
  'SOT-323 (SC-70)', 'SOT-353', 'SOT-363', 'SC-70', 'SC-89',
  // ── SMD power (tab) ──
  'DPAK (TO-252)', 'D2PAK (TO-263)', 'D3PAK (TO-268)', 'PowerPAK', 'DirectFET',
  // ── SMD IC — gull-wing ──
  'SOIC-8', 'SOIC-14', 'SOIC-16', 'SOIC-18', 'SOIC-20', 'SOIC-24', 'SOIC-28',
  'SOP-8', 'SOP-16', 'SSOP-16', 'SSOP-20', 'SSOP-24', 'SSOP-28',
  'TSSOP-8', 'TSSOP-14', 'TSSOP-16', 'TSSOP-20', 'TSSOP-24', 'TSSOP-28', 'TSSOP-38', 'TSSOP-48', 'TSSOP-56',
  'MSOP-8', 'MSOP-10', 'MSOP-12',
  'QSOP-16', 'QSOP-20', 'QSOP-24',
  // ── SMD IC — quad flat ──
  'QFP-32', 'QFP-44', 'QFP-64', 'QFP-100', 'QFP-144', 'QFP-208',
  'TQFP-32', 'TQFP-44', 'TQFP-48', 'TQFP-64', 'TQFP-100', 'TQFP-144',
  'LQFP-32', 'LQFP-44', 'LQFP-48', 'LQFP-64', 'LQFP-100', 'LQFP-144', 'LQFP-176', 'LQFP-208',
  // ── SMD IC — no-lead ──
  'DFN-6', 'DFN-8', 'DFN-10', 'DFN-12',
  'QFN-16', 'QFN-20', 'QFN-24', 'QFN-28', 'QFN-32', 'QFN-40', 'QFN-44', 'QFN-48', 'QFN-56', 'QFN-64',
  'WLCSP', 'LGA', 'BGA', 'µBGA', 'FBGA',
  // ── SMD LED ──
  'LED 0402', 'LED 0603', 'LED 0805', 'LED 1206', 'LED 2835', 'LED 3528', 'LED 3535', 'LED 5050', 'LED 5630',
  // ── Crystal / oscillator ──
  'HC-49/S SMD', 'SMD 3215', 'SMD 3225', 'SMD 5032', 'SMD 7050',
  // ── THT — resistors / diodes (axial) ──
  'Axial DO-35', 'Axial DO-41', 'Axial DO-201', 'Axial 1/4W', 'Axial 1/2W', 'Axial 1W',
  // ── THT — capacitors / inductors (radial) ──
  'Radial 2.5mm', 'Radial 5mm', 'Radial 7.5mm', 'Radial 10mm',
  // ── THT — transistors / regulators ──
  'TO-18', 'TO-92', 'TO-126', 'TO-220', 'TO-220F', 'TO-247', 'TO-3', 'TO-3P', 'TO-247-3',
  // ── THT — DIP ICs ──
  'DIP-4', 'DIP-6', 'DIP-8', 'DIP-14', 'DIP-16', 'DIP-18', 'DIP-20', 'DIP-24', 'DIP-28', 'DIP-32', 'DIP-40',
  'SIP-3', 'SIP-5', 'SIP-7', 'SIP-9',
  // ── THT — LEDs ──
  'LED 3mm (THT)', 'LED 5mm (THT)', 'LED 8mm (THT)', 'LED 10mm (THT)',
  // ── THT — crystals / connectors / misc ──
  'HC-49U', 'HC-49S',
  'Pin Header 2.54mm', 'Pin Header 2.00mm', 'Pin Header 1.27mm',
  'Screw Terminal 3.5mm', 'Screw Terminal 5.08mm',
  'Relay (THT)', 'Relay (SMD)',
  'Module', 'Other',
];

// ── validation ──────────────────────────────────────────────────────────────────

/** LCSC part numbers are a "C" prefix followed by digits (e.g. C25804). Empty is allowed. */
export function isValidLcsc(lcsc: string): boolean {
  const v = lcsc.trim();
  return v === '' || /^C\d+$/i.test(v);
}

// ── VFS persistence ──────────────────────────────────────────────────────────────

const LIBRARY_NAME = 'MyElements';
const LIBRARY_EXT = '.json';

/**
 * On-disk shape. `version` 1 had no categories and no per-element category;
 * {@link loadLibrary} migrates it transparently to the current shape.
 */
interface MyElementsFile {
  version: number;
  categories?: Category[];
  elements: Partial<MyElement>[];
}

/** Fill in fields missing from older files so callers always get a complete element. */
function normalizeElement(e: Partial<MyElement>): MyElement {
  return {
    id: e.id ?? crypto.randomUUID(),
    name: e.name ?? '',
    description: e.description ?? '',
    componentType: e.componentType ?? '',
    value: e.value ?? '',
    valueUnit: e.valueUnit ?? '—',
    packageType: e.packageType ?? '',
    mpn: e.mpn ?? '',
    lcsc: e.lcsc ?? '',
    category: e.category ?? '',
    quantity: typeof e.quantity === 'number' ? e.quantity : Number(e.quantity) || 0,
  };
}

/** Load the current user's library. A missing file yields an empty library. */
export async function loadLibrary(): Promise<MyElementsLibrary> {
  try {
    const text = await readFileAt(userRootDir(), LIBRARY_NAME, LIBRARY_EXT);
    const parsed = JSON.parse(text) as MyElementsFile;
    const elements = Array.isArray(parsed.elements) ? parsed.elements.map(normalizeElement) : [];
    const categories = Array.isArray(parsed.categories) ? parsed.categories : [];
    return { categories, elements };
  } catch {
    // A missing library file is the normal first-run state → start empty.
    return { categories: [], elements: [] };
  }
}

/** Persist the current user's library (create or overwrite). */
export async function saveLibrary(lib: MyElementsLibrary): Promise<void> {
  const file: MyElementsFile = { version: 2, categories: lib.categories, elements: lib.elements };
  await writeFileAt(userRootDir(), LIBRARY_NAME, LIBRARY_EXT, JSON.stringify(file, null, 2));
}
