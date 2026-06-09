import { CppWasmRuntime } from '@mhersztowski/web-cpp';
import { minisApi } from '../services/MinisApiService';
import { useAuth } from '../modules/auth';

export interface ArduinoWasmRuntimeProps {
  open: boolean;
  onClose: () => void;
  userName: string;
  projectName: string;
  sketchName: string;
}

export function ArduinoWasmRuntime({ open, onClose, userName, projectName, sketchName }: ArduinoWasmRuntimeProps) {
  const { token } = useAuth();

  return (
    <CppWasmRuntime
      open={open}
      onClose={onClose}
      title={`WASM Simulator — ${sketchName}`}
      buildSseUrl={minisApi.getArduinoWasmBuildSseUrl(userName, projectName, sketchName)}
      wasmJsUrl={minisApi.getArduinoWasmJsUrl(userName, projectName, sketchName)}
      token={token}
    />
  );
}
