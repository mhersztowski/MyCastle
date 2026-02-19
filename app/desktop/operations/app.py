import os
import subprocess
import webbrowser
from operations import operation


@operation("open_app")
def open_app(params: dict) -> dict:
    path = params.get("path")
    args = params.get("args", [])

    if not path:
        raise ValueError("path is required")

    if os.name == "nt":
        os.startfile(path)
    else:
        subprocess.Popen([path] + args)

    return {"success": True}


@operation("open_url")
def open_url(params: dict) -> dict:
    url = params.get("url")
    if not url:
        raise ValueError("url is required")

    webbrowser.open(url)
    return {"success": True}
