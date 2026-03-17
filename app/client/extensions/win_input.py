"""Persistent PowerShell process for Windows input simulation.

Keeps one powershell.exe alive — avoids re-compiling Add-Type on every call.
"""

import logging
import subprocess
import threading

log = logging.getLogger("win_input")

_SENTINEL = "##DONE##"

_INIT_SCRIPT = r"""
$ErrorActionPreference = 'SilentlyContinue'
$WarningPreference     = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;
public class WinInput {
    [DllImport("user32.dll")] public static extern void  keybd_event(byte vk, byte scan, int flags, IntPtr extra);
    [DllImport("user32.dll")] public static extern void  mouse_event(int flags, int dx, int dy, int data, IntPtr extra);
    [DllImport("user32.dll")] public static extern bool  SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool  GetCursorPos(out Point p);
    [DllImport("user32.dll")] public static extern int   GetSystemMetrics(int n);
    public const int KEYDOWN = 0; public const int KEYUP = 2;
    public const int SM_CXSCREEN  = 0;  public const int SM_CYSCREEN       = 1;
    public const int MOUSEEVENTF_LEFTDOWN   = 0x0002; public const int MOUSEEVENTF_LEFTUP    = 0x0004;
    public const int MOUSEEVENTF_RIGHTDOWN  = 0x0008; public const int MOUSEEVENTF_RIGHTUP   = 0x0010;
    public const int MOUSEEVENTF_MIDDLEDOWN = 0x0020; public const int MOUSEEVENTF_MIDDLEUP  = 0x0040;
    public const int MOUSEEVENTF_WHEEL      = 0x0800; public const int MOUSEEVENTF_HWHEEL    = 0x01000;
}
'@ 2>$null
[Console]::WriteLine("READY")
[Console]::Out.Flush()
"""


class PsRunner:
    """Single persistent powershell.exe process shared by keyboard & mouse."""

    def __init__(self):
        self._lock = threading.Lock()
        self._proc = subprocess.Popen(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "-"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self._proc.stdin.write(_INIT_SCRIPT + "\n")
        self._proc.stdin.flush()

        ready = self._proc.stdout.readline().strip()
        if ready == "READY":
            log.info("PowerShell process ready")
        else:
            log.warning(f"Unexpected PS init response: {ready!r} — continuing anyway")

    def run(self, script: str) -> str:
        """Execute script and return stdout (blocks until sentinel received)."""
        with self._lock:
            cmd = script + f'\n[Console]::WriteLine("{_SENTINEL}")\n[Console]::Out.Flush()\n'
            self._proc.stdin.write(cmd)
            self._proc.stdin.flush()

            lines = []
            while True:
                line = self._proc.stdout.readline()
                if not line:
                    break
                stripped = line.rstrip("\n")
                if stripped == _SENTINEL:
                    break
                lines.append(stripped)
            return "\n".join(lines).strip()

    def close(self):
        try:
            self._proc.stdin.write("exit\n")
            self._proc.stdin.flush()
            self._proc.wait(timeout=3)
        except Exception:
            self._proc.kill()


_runner: PsRunner | None = None
_runner_lock = threading.Lock()


def get_runner() -> PsRunner:
    global _runner
    if _runner is None:
        with _runner_lock:
            if _runner is None:
                log.info("Starting persistent PowerShell process…")
                _runner = PsRunner()
    return _runner
