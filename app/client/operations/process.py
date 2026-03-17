import psutil
from operations import operation


@operation("list_processes")
def list_processes(params: dict) -> dict:
    sort_by = params.get("sort_by", "memory")  # "memory", "cpu", "name"
    limit = params.get("limit", 50)

    processes = []
    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info"]):
        try:
            info = proc.info
            mem_mb = round(info["memory_info"].rss / (1024 * 1024), 1) if info["memory_info"] else 0
            processes.append({
                "pid": info["pid"],
                "name": info["name"],
                "cpu_percent": info["cpu_percent"] or 0,
                "memory_mb": mem_mb,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    key = {"memory": "memory_mb", "cpu": "cpu_percent", "name": "name"}.get(sort_by, "memory_mb")
    reverse = sort_by != "name"
    processes.sort(key=lambda p: p[key], reverse=reverse)

    return {"processes": processes[:limit], "total": len(processes)}


@operation("kill_process")
def kill_process(params: dict) -> dict:
    pid = params.get("pid")
    name = params.get("name")

    if not pid and not name:
        raise ValueError("pid or name is required")

    killed = []

    if pid:
        proc = psutil.Process(pid)
        proc_name = proc.name()
        proc.terminate()
        killed.append({"pid": pid, "name": proc_name})
    elif name:
        for proc in psutil.process_iter(["pid", "name"]):
            try:
                if proc.info["name"] and proc.info["name"].lower() == name.lower():
                    proc.terminate()
                    killed.append({"pid": proc.info["pid"], "name": proc.info["name"]})
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

    if not killed:
        raise ValueError(f"No process found matching: pid={pid}, name={name}")

    return {"success": True, "killed": killed}
