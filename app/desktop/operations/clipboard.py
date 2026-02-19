import pyperclip
from operations import operation


@operation("get_clipboard")
def get_clipboard(params: dict) -> dict:
    text = pyperclip.paste()
    return {"text": text}


@operation("set_clipboard")
def set_clipboard(params: dict) -> dict:
    text = params.get("text")
    if text is None:
        raise ValueError("text is required")
    pyperclip.copy(text)
    return {"success": True}
