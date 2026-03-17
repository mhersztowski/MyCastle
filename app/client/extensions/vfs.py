"""VFS extension — exposes a local directory over MQTT.

Protocol (mirrors packages/core/src/iot/device/IotDeviceVfsExtension.ts):
  Request  topic: minis/{user}/{device}/ext/vfs/req
  Response topic: minis/{user}/{device}/ext/vfs/res

Request payload:
  { "id": str, "op": str, "path": str?, "newPath": str?,
    "data": base64str?, "options": dict? }

Response payload:
  { "id": str, "ok": bool, "data": any?, "error": {"code": str, "message": str}? }

Supported operations:
  stat      → FileStat  { type: 1|2, size, ctime, mtime }
  readdir   → { entries: [{ name, type }] }
  readfile  → { data: base64 }
  writefile ← data (base64), options: { create?, overwrite? }
  delete    ← options: { recursive? }
  rename    ← newPath, options: { overwrite? }
  mkdir
"""

import base64
import json
import logging
import os
import shutil

log = logging.getLogger("vfs")

# FileType constants matching packages/core/src/vfs/types.ts
FILE_TYPE_FILE      = 1
FILE_TYPE_DIRECTORY = 2


class VfsExtension:
    def __init__(self, root_dir: str, publish_fn):
        """
        :param root_dir:   Absolute path to the directory exposed as VFS root.
        :param publish_fn: Callable(payload_str) — publishes to the res topic.
        """
        self.root_dir = os.path.realpath(root_dir)
        self.publish_fn = publish_fn
        os.makedirs(self.root_dir, exist_ok=True)
        log.info(f"VFS extension ready, root={self.root_dir}")

    # --- Public ---

    def handle_request(self, payload: dict):
        req_id = payload.get("id")
        op = payload.get("op")
        path = payload.get("path")

        try:
            data = self._dispatch(op, path, payload)
            self._respond(req_id, True, data)
        except PermissionError as e:
            self._respond(req_id, False, error={"code": "NoPermissions", "message": str(e)})
        except FileNotFoundError as e:
            self._respond(req_id, False, error={"code": "FileNotFound", "message": str(e)})
        except FileExistsError as e:
            self._respond(req_id, False, error={"code": "FileExists", "message": str(e)})
        except NotADirectoryError as e:
            self._respond(req_id, False, error={"code": "FileNotADirectory", "message": str(e)})
        except IsADirectoryError as e:
            self._respond(req_id, False, error={"code": "FileIsADirectory", "message": str(e)})
        except Exception as e:
            log.error(f"VFS op={op} path={path} error: {e}")
            self._respond(req_id, False, error={"code": "Unknown", "message": str(e)})

    # --- Dispatch ---

    def _dispatch(self, op: str, path: str | None, payload: dict) -> dict:
        match op:
            case "stat":
                return self._stat(self._resolve(path))
            case "readdir":
                return self._readdir(self._resolve(path))
            case "readfile":
                return self._readfile(self._resolve(path))
            case "writefile":
                return self._writefile(
                    self._resolve(path),
                    payload.get("data", ""),
                    payload.get("options") or {},
                )
            case "delete":
                return self._delete(
                    self._resolve(path),
                    payload.get("options") or {},
                )
            case "rename":
                new_path = payload.get("newPath")
                if not new_path:
                    raise ValueError("rename requires 'newPath'")
                return self._rename(
                    self._resolve(path),
                    self._resolve(new_path),
                    payload.get("options") or {},
                )
            case "mkdir":
                return self._mkdir(self._resolve(path))
            case _:
                raise ValueError(f"Unknown VFS operation: {op!r}")

    # --- Operations ---

    def _stat(self, real: str) -> dict:
        s = os.stat(real)
        return {
            "type": FILE_TYPE_DIRECTORY if os.path.isdir(real) else FILE_TYPE_FILE,
            "size": s.st_size,
            "ctime": int(s.st_ctime * 1000),
            "mtime": int(s.st_mtime * 1000),
        }

    def _readdir(self, real: str) -> dict:
        entries = []
        for name in sorted(os.listdir(real)):
            child = os.path.join(real, name)
            entries.append({
                "name": name,
                "type": FILE_TYPE_DIRECTORY if os.path.isdir(child) else FILE_TYPE_FILE,
            })
        return {"entries": entries}

    def _readfile(self, real: str) -> dict:
        with open(real, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("ascii")
        return {"data": encoded}

    def _writefile(self, real: str, data_b64: str, options: dict) -> dict:
        create = options.get("create", True)
        overwrite = options.get("overwrite", True)

        exists = os.path.exists(real)
        if exists and not overwrite:
            raise FileExistsError(real)
        if not exists and not create:
            raise FileNotFoundError(real)

        os.makedirs(os.path.dirname(real), exist_ok=True)
        content = base64.b64decode(data_b64)
        with open(real, "wb") as f:
            f.write(content)
        return {}

    def _delete(self, real: str, options: dict) -> dict:
        recursive = options.get("recursive", False)
        if os.path.isdir(real):
            if recursive:
                shutil.rmtree(real)
            else:
                os.rmdir(real)
        else:
            os.remove(real)
        return {}

    def _rename(self, old_real: str, new_real: str, options: dict) -> dict:
        overwrite = options.get("overwrite", False)
        if os.path.exists(new_real) and not overwrite:
            raise FileExistsError(new_real)
        os.makedirs(os.path.dirname(new_real), exist_ok=True)
        os.rename(old_real, new_real)
        return {}

    def _mkdir(self, real: str) -> dict:
        os.makedirs(real, exist_ok=True)
        return {}

    # --- Helpers ---

    def _resolve(self, path: str | None) -> str:
        """Resolve a VFS path to a real filesystem path. Prevents directory traversal."""
        if not path:
            raise ValueError("'path' is required")
        real = os.path.realpath(os.path.join(self.root_dir, path.lstrip("/\\")))
        if not real.startswith(self.root_dir):
            raise PermissionError(f"Access denied: {path!r}")
        return real

    def _respond(self, req_id: str, ok: bool, data: dict | None = None, error: dict | None = None):
        packet: dict = {"id": req_id, "ok": ok}
        if data is not None:
            packet["data"] = data
        if error is not None:
            packet["error"] = error
        self.publish_fn(json.dumps(packet))
