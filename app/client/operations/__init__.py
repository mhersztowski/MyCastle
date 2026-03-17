import logging
from typing import Callable, Any

log = logging.getLogger(__name__)

# Global operation registry
_operations: dict[str, Callable[..., Any]] = {}


def operation(name: str):
    """Decorator to register a desktop operation.

    Usage:
        @operation("system_info")
        def system_info(params: dict) -> dict:
            ...
    """
    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        _operations[name] = fn
        return fn
    return decorator


def get_operations() -> dict[str, Callable[..., Any]]:
    return dict(_operations)


def list_operations() -> list[str]:
    return sorted(_operations.keys())


async def execute(action: str, params: dict | None = None) -> Any:
    fn = _operations.get(action)
    if fn is None:
        raise ValueError(f"Unknown operation: {action}")
    params = params or {}
    import asyncio
    if asyncio.iscoroutinefunction(fn):
        return await fn(params)
    return fn(params)


def load_all():
    """Import all operation modules to trigger @operation registrations."""
    from operations import system, process, window, clipboard, shell, app, media  # noqa: F401
    log.info(f"Loaded {len(_operations)} operations: {', '.join(list_operations())}")
