import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Select, MenuItem, Switch,
  FormControlLabel, CircularProgress, Alert, List, ListItemButton,
  ListItemText, Chip, Divider, FormControl, InputLabel, Autocomplete,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { getHttpUrl } from '@mhersztowski/web-client';

interface SchemaProperty {
  type?: string;
  enum?: string[];
  description?: string;
  'x-autocomplete'?: string;
  'x-depends-on'?: string;
}

interface MethodSchema {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

interface RpcMethodInfo {
  name: string;
  description: string;
  tags: string[];
  inputSchema: MethodSchema;
}

function parseRpcMethods(spec: any): RpcMethodInfo[] {
  const methods: RpcMethodInfo[] = [];
  const paths = spec?.paths ?? {};
  for (const [path, pathItem] of Object.entries<any>(paths)) {
    if (!path.startsWith('/rpc/')) continue;
    const name = path.replace('/rpc/', '');
    const post = pathItem?.post;
    if (!post) continue;
    methods.push({
      name,
      description: post.summary ?? name,
      tags: post.tags ?? ['RPC'],
      inputSchema: post.requestBody?.content?.['application/json']?.schema ?? {},
    });
  }
  return methods;
}

function buildRequestBody(schema: MethodSchema, values: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(schema.properties ?? {})) {
    const val = values[key];
    if (val !== undefined && val !== '') {
      body[key] = val;
    }
  }
  return body;
}

// Autocomplete data fetcher
async function fetchAutocompleteOptions(source: string, dependsOnValue?: string): Promise<string[]> {
  const base = getHttpUrl();
  try {
    if (source === 'users') {
      const res = await fetch(`${base}/api/admin/users`);
      const data = await res.json();
      return (data.items ?? []).map((u: any) => u.name as string);
    }
    if (source === 'userDevices' && dependsOnValue) {
      const res = await fetch(`${base}/api/users/${encodeURIComponent(dependsOnValue)}/devices`);
      const data = await res.json();
      return (data.items ?? []).map((d: any) => d.name as string);
    }
  } catch { /* ignore */ }
  return [];
}

function useAutocompleteOptions(source: string | undefined, dependsOnValue: string | undefined) {
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    if (!source) return;
    if (source === 'userDevices' && !dependsOnValue) {
      setOptions([]);
      return;
    }
    fetchAutocompleteOptions(source, dependsOnValue).then(setOptions);
  }, [source, dependsOnValue]);

  return options;
}

function SchemaField({ name, prop, required, value, onChange, formValues }: {
  name: string;
  prop: SchemaProperty;
  required: boolean;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  formValues: Record<string, unknown>;
}) {
  const label = `${name}${required ? ' *' : ''}`;
  const helperText = prop.description;
  const autocompleteSource = prop['x-autocomplete'];
  const dependsOn = prop['x-depends-on'];
  const dependsOnValue = dependsOn ? (formValues[dependsOn] as string) : undefined;
  const autocompleteOptions = useAutocompleteOptions(autocompleteSource, dependsOnValue);

  // Autocomplete field
  if (autocompleteSource) {
    return (
      <Autocomplete
        freeSolo
        size="small"
        sx={{ mb: 1.5 }}
        options={autocompleteOptions}
        value={(value as string) ?? ''}
        onInputChange={(_e, newValue) => onChange(name, newValue)}
        disabled={!!dependsOn && !dependsOnValue}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            helperText={dependsOn && !dependsOnValue ? `Select ${dependsOn} first` : helperText}
            required={required}
            autoComplete="off"
            inputProps={{ ...params.inputProps, 'data-bwignore': 'true', 'data-1p-ignore': 'true', 'data-lpignore': 'true' }}
          />
        )}
      />
    );
  }

  if (prop.enum) {
    return (
      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
        <InputLabel>{label}</InputLabel>
        <Select
          label={label}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(name, e.target.value)}
        >
          <MenuItem value=""><em>— none —</em></MenuItem>
          {prop.enum.map((opt) => (
            <MenuItem key={opt} value={opt}>{opt}</MenuItem>
          ))}
        </Select>
        {helperText && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, ml: 1.5 }}>{helperText}</Typography>}
      </FormControl>
    );
  }

  if (prop.type === 'boolean') {
    return (
      <Box sx={{ mb: 1.5 }}>
        <FormControlLabel
          control={
            <Switch
              checked={!!value}
              onChange={(e) => onChange(name, e.target.checked)}
            />
          }
          label={label}
        />
        {helperText && <Typography variant="caption" color="text.secondary" display="block" sx={{ ml: 1.5 }}>{helperText}</Typography>}
      </Box>
    );
  }

  if (prop.type === 'object') {
    return (
      <TextField
        fullWidth size="small" sx={{ mb: 1.5 }}
        label={label}
        helperText={helperText ?? 'JSON object'}
        multiline minRows={2} maxRows={6}
        value={(value as string) ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder='{ "key": "value" }'
        autoComplete="off"
        inputProps={{ 'data-bwignore': 'true', 'data-1p-ignore': 'true', 'data-lpignore': 'true' }}
      />
    );
  }

  const isNumber = prop.type === 'number' || prop.type === 'integer';

  return (
    <TextField
      fullWidth size="small" sx={{ mb: 1.5 }}
      label={label}
      helperText={helperText}
      type={isNumber ? 'number' : 'text'}
      required={required}
      value={value ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        onChange(name, isNumber && v !== '' ? Number(v) : v);
      }}
      autoComplete="off"
      inputProps={{ 'data-bwignore': 'true', 'data-1p-ignore': 'true', 'data-lpignore': 'true' }}
    />
  );
}

interface NodeRedTarget {
  label: string;
  baseUrl: string;
}

const nodeRedTargets: NodeRedTarget[] = [
  { label: 'NR Local', baseUrl: 'http://172.17.0.1:1902' },
  { label: 'NR Remote', baseUrl: 'https://minis.hersztowski.org' },
];

function nodeRedId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function buildNodeRedRpc(methodName: string, body: Record<string, unknown>, target: NodeRedTarget): string {
  const injectId = nodeRedId();
  const httpId = nodeRedId();
  const debugId = nodeRedId();
  return JSON.stringify([
    {
      id: injectId, type: 'inject', name: methodName,
      props: [
        { p: 'payload', v: JSON.stringify(body), vt: 'json' },
      ],
      repeat: '', crontab: '', once: false, onceDelay: 0.1, topic: '',
      x: 150, y: 200, wires: [[httpId]],
    },
    {
      id: httpId, type: 'http request', name: `RPC: ${methodName}`,
      method: 'POST', ret: 'obj', paytoqs: 'ignore',
      url: `${target.baseUrl}/api/rpc/${methodName}`,
      tls: '', persist: false, proxy: '', insecureHTTPParser: false,
      authType: '', senderr: false, headers: [],
      x: 400, y: 200, wires: [[debugId]],
    },
    {
      id: debugId, type: 'debug', name: '', active: true,
      tosidebar: true, console: false, tostatus: false,
      complete: 'payload', targetType: 'msg',
      x: 650, y: 200, wires: [],
    },
  ]);
}

function RpcExplorerPage() {
  const [methods, setMethods] = useState<RpcMethodInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [response, setResponse] = useState<{ ok: boolean; data: unknown } | null>(null);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${getHttpUrl()}/api/docs/swagger.json`);
        const spec = await res.json();
        const parsed = parseRpcMethods(spec);
        setMethods(parsed);
        if (parsed.length > 0) setSelectedMethod(parsed[0].name);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load API spec');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentMethod = useMemo(
    () => methods.find((m) => m.name === selectedMethod),
    [methods, selectedMethod],
  );

  const handleSelectMethod = useCallback((name: string) => {
    setSelectedMethod(name);
    setFormValues({});
    setResponse(null);
  }, []);

  const handleFieldChange = useCallback((name: string, value: unknown) => {
    setFormValues((prev) => {
      const next = { ...prev, [name]: value };
      // Clear dependent fields when parent changes
      if (currentMethod) {
        const props = currentMethod.inputSchema.properties ?? {};
        for (const [fieldName, fieldProp] of Object.entries(props)) {
          if (fieldProp['x-depends-on'] === name) {
            next[fieldName] = '';
          }
        }
      }
      return next;
    });
  }, [currentMethod]);

  const requestBody = useMemo(() => {
    if (!currentMethod) return {};
    return buildRequestBody(currentMethod.inputSchema, formValues);
  }, [currentMethod, formValues]);

  const handleExecute = useCallback(async () => {
    if (!currentMethod) return;
    setExecuting(true);
    setResponse(null);
    try {
      const body: Record<string, unknown> = {};
      const props = currentMethod.inputSchema.properties ?? {};
      for (const [key, val] of Object.entries(requestBody)) {
        if (props[key]?.type === 'object' && typeof val === 'string') {
          try { body[key] = JSON.parse(val); } catch { body[key] = val; }
        } else {
          body[key] = val;
        }
      }

      const res = await fetch(`${getHttpUrl()}/api/rpc/${currentMethod.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResponse({ ok: data.ok, data });
    } catch (err) {
      setResponse({ ok: false, data: { error: err instanceof Error ? err.message : 'Request failed' } });
    } finally {
      setExecuting(false);
    }
  }, [currentMethod, requestBody]);

  const tagGroups = useMemo(() => {
    const groups: Record<string, RpcMethodInfo[]> = {};
    for (const m of methods) {
      const tag = m.tags[0] ?? 'Other';
      (groups[tag] ??= []).push(m);
    }
    return groups;
  }, [methods]);

  if (loading) return <Box sx={{ p: 4 }}><CircularProgress /></Box>;
  if (error) return <Box><Alert severity="error">{error}</Alert></Box>;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>RPC Explorer</Typography>
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        {/* Method list */}
        <Paper sx={{ width: { md: 240 }, flexShrink: 0 }}>
          <List dense disablePadding>
            {Object.entries(tagGroups).map(([tag, tagMethods]) => (
              <Box key={tag}>
                <Typography variant="overline" sx={{ px: 2, pt: 1, display: 'block', color: 'text.secondary' }}>{tag}</Typography>
                {tagMethods.map((m) => (
                  <ListItemButton
                    key={m.name}
                    selected={m.name === selectedMethod}
                    onClick={() => handleSelectMethod(m.name)}
                    sx={{ py: 0.5 }}
                  >
                    <ListItemText
                      primary={m.name}
                      primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }}
                    />
                  </ListItemButton>
                ))}
              </Box>
            ))}
          </List>
        </Paper>

        {/* Method detail */}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {currentMethod ? (
            <>
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="h6" fontFamily="monospace">{currentMethod.name}</Typography>
                {currentMethod.tags.map((t) => <Chip key={t} label={t} size="small" />)}
              </Box>
              {currentMethod.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{currentMethod.description}</Typography>
              )}

              {/* Form fields */}
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Input</Typography>
                {Object.entries(currentMethod.inputSchema.properties ?? {}).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No input parameters</Typography>
                ) : (
                  Object.entries(currentMethod.inputSchema.properties ?? {}).map(([name, prop]) => (
                    <SchemaField
                      key={name}
                      name={name}
                      prop={prop}
                      required={(currentMethod.inputSchema.required ?? []).includes(name)}
                      value={formValues[name]}
                      onChange={handleFieldChange}
                      formValues={formValues}
                    />
                  ))
                )}
              </Paper>

              {/* Live JSON preview */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Request Body</Typography>
                <Box component="pre" sx={{ m: 0, fontSize: 13, fontFamily: 'monospace', overflow: 'auto' }}>
                  {JSON.stringify(requestBody, null, 2)}
                </Box>
              </Paper>

              {/* Execute */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <Button
                  variant="contained"
                  startIcon={executing ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
                  onClick={handleExecute}
                  disabled={executing}
                >
                  Execute
                </Button>
                {nodeRedTargets.map((t) => (
                  <Button
                    key={t.label}
                    size="small"
                    startIcon={<AccountTreeIcon fontSize="small" />}
                    onClick={() => navigator.clipboard.writeText(buildNodeRedRpc(currentMethod.name, requestBody, t))}
                  >
                    {t.label}
                  </Button>
                ))}
              </Box>

              {/* Response */}
              {response && (
                <Paper sx={{
                  p: 2,
                  border: 2,
                  borderColor: response.ok ? 'success.main' : 'error.main',
                }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Response {response.ok ? '(Success)' : '(Error)'}
                  </Typography>
                  <Divider sx={{ mb: 1 }} />
                  <Box component="pre" sx={{ m: 0, fontSize: 13, fontFamily: 'monospace', overflow: 'auto', maxHeight: 400 }}>
                    {JSON.stringify(response.data, null, 2)}
                  </Box>
                </Paper>
              )}
            </>
          ) : (
            <Typography color="text.secondary">Select a method from the list</Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default RpcExplorerPage;
