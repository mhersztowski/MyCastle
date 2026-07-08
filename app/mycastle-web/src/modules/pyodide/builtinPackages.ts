/**
 * Curated list of the most useful packages that ship pre-built with Pyodide
 * (loadable via `pyodide.loadPackage`, no PyPI/micropip needed). Shown as a
 * checklist in the dashboard's Pyodide settings. The full catalogue is large;
 * anything not here can still be added as a PyPI package.
 */
export interface BuiltinPackage { name: string; label: string }

export const PYODIDE_BUILTIN_PACKAGES: BuiltinPackage[] = [
  { name: 'numpy', label: 'NumPy' },
  { name: 'scipy', label: 'SciPy' },
  { name: 'pandas', label: 'pandas' },
  { name: 'matplotlib', label: 'Matplotlib' },
  { name: 'scikit-learn', label: 'scikit-learn' },
  { name: 'sympy', label: 'SymPy' },
  { name: 'statsmodels', label: 'statsmodels' },
  { name: 'networkx', label: 'NetworkX' },
  { name: 'pillow', label: 'Pillow' },
  { name: 'sqlite3', label: 'sqlite3' },
  { name: 'lxml', label: 'lxml' },
  { name: 'beautifulsoup4', label: 'BeautifulSoup4' },
  { name: 'regex', label: 'regex' },
  { name: 'micropip', label: 'micropip (install from PyPI)' },
];
