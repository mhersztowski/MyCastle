import platform
import socket
import psutil
from operations import operation


@operation("system_info")
def system_info(params: dict) -> dict:
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    return {
        "hostname": socket.gethostname(),
        "os": platform.system(),
        "os_version": platform.version(),
        "architecture": platform.machine(),
        "cpu_count": psutil.cpu_count(),
        "cpu_percent": psutil.cpu_percent(interval=0.5),
        "ram_total_mb": round(mem.total / (1024 * 1024)),
        "ram_used_mb": round(mem.used / (1024 * 1024)),
        "ram_percent": mem.percent,
        "disk_total_gb": round(disk.total / (1024 ** 3), 1),
        "disk_used_gb": round(disk.used / (1024 ** 3), 1),
        "disk_percent": disk.percent,
    }


@operation("notification")
def notification(params: dict) -> dict:
    title = params.get("title", "MyCastle")
    message = params.get("message", "")
    if not message:
        raise ValueError("message is required")

    try:
        from winotify import Notification
        toast = Notification(
            app_id="MyCastle Desktop Agent",
            title=title,
            msg=message,
        )
        toast.show()
    except ImportError:
        # Fallback: use PowerShell toast on Windows
        import subprocess
        ps_script = (
            f'[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, '
            f'ContentType = WindowsRuntime] | Out-Null; '
            f'$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(0); '
            f'$text = $template.GetElementsByTagName("text"); '
            f'$text[0].AppendChild($template.CreateTextNode("{title}")) | Out-Null; '
            f'$text[1].AppendChild($template.CreateTextNode("{message}")) | Out-Null; '
            f'$toast = [Windows.UI.Notifications.ToastNotification]::new($template); '
            f'[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("MyCastle").Show($toast)'
        )
        subprocess.run(["powershell", "-Command", ps_script], capture_output=True, timeout=10)

    return {"success": True}
