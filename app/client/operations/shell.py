import subprocess
from config import SHELL_COMMAND_TIMEOUT, SHELL_MAX_OUTPUT_SIZE
from operations import operation


@operation("run_command")
def run_command(params: dict) -> dict:
    command = params.get("command")
    if not command:
        raise ValueError("command is required")

    timeout = params.get("timeout", SHELL_COMMAND_TIMEOUT)
    timeout = min(timeout, 120)  # Hard cap at 2 minutes

    result = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
        timeout=timeout,
    )

    stdout = result.stdout[:SHELL_MAX_OUTPUT_SIZE]
    stderr = result.stderr[:SHELL_MAX_OUTPUT_SIZE]

    return {
        "stdout": stdout,
        "stderr": stderr,
        "return_code": result.returncode,
    }
