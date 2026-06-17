import { useState, useCallback, useRef } from 'react';
import {
  Box, Button, Typography, Divider, Chip, Paper,
  CircularProgress, Alert,
} from '@mui/material';
import Editor from '@monaco-editor/react';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import { minisApi } from '@/services/MinisApiService';

const EXAMPLE = `// MinisC example
int counter = 0;

void greet(string name) {
    print("Hello, ");
    print(name);
    print("!\\n");
}

int main() {
    counter = 1;
    while (counter <= 5) {
        greet("World");
        counter = counter + 1;
    }
    return 0;
}
`;

export default function MiniscPage() {
  const [source, setSource] = useState(EXAMPLE);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ size: number; disasm: string; bytecode: number[] } | null>(null);
  const bytecodeRef = useRef<number[]>([]);

  const handleCompile = useCallback(async () => {
    setCompiling(true);
    setError(null);
    setResult(null);
    try {
      const res = await minisApi.miniscCompile(source);
      bytecodeRef.current = res.bytecode;
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCompiling(false);
    }
  }, [source]);

  const handleDownload = useCallback(() => {
    if (!bytecodeRef.current.length) return;
    const blob = new Blob([new Uint8Array(bytecodeRef.current)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.mbc';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mr: 1 }}>MinisC</Typography>
        <Chip label="Bytecode VM" size="small" variant="outlined" />
        <Box sx={{ flex: 1 }} />
        {result && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownload}
          >
            Download .mbc
          </Button>
        )}
        <Button
          size="small"
          variant="contained"
          startIcon={compiling ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
          onClick={handleCompile}
          disabled={compiling}
        >
          Compile
        </Button>
      </Box>

      {/* Main area: editor + output */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Source editor */}
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <Editor
            height="100%"
            defaultLanguage="c"
            value={source}
            onChange={(v) => setSource(v ?? '')}
            theme="vs-dark"
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        </Box>

        <Divider orientation="vertical" flexItem />

        {/* Output panel */}
        <Box sx={{ width: 420, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
          {error && (
            <Alert severity="error" sx={{ m: 1, flexShrink: 0 }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {error}
              </Typography>
            </Alert>
          )}

          {result && (
            <>
              <Box sx={{ px: 2, py: 1, flexShrink: 0, display: 'flex', gap: 2 }}>
                <Chip label={`${result.size} bytes`} color="success" size="small" />
              </Box>
              <Divider />
              <Paper
                variant="outlined"
                sx={{
                  flex: 1, m: 1, overflow: 'auto',
                  bgcolor: '#1e1e1e', color: '#d4d4d4',
                  fontFamily: 'monospace', fontSize: 12,
                  p: 1.5,
                  whiteSpace: 'pre',
                  border: 'none',
                }}
              >
                {result.disasm}
              </Paper>
            </>
          )}

          {!error && !result && (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
              <Typography variant="body2">Press Compile to see disassembly</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
