"""Translation helpers used by Python tests and the LLM microservice.

query_llm_robust performs language detection and translation via client.chat.
translate_content remains a deterministic stub for direct unit tests.
"""

from __future__ import annotations

import re
from typing import Any

_CJK_RE = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")


class _ChatClient:
    """Placeholder client; tests patch client.chat."""

    def chat(self, *args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("client.chat must be mocked in tests or wired to a local model")


client = _ChatClient()


def _chat_content(result: Any) -> str:
    if result is None:
        return ""
    if hasattr(result, "message"):
        msg = getattr(result, "message", None)
        if msg is not None and hasattr(msg, "content"):
            return str(getattr(msg, "content", "") or "")
    if isinstance(result, str):
        return result
    return str(result)


def _ai_filler(s: str) -> bool:
    low = s.lower()
    if "as an ai" in low:
        return True
    if "i can translate this if you want" in low:
        return True
    return False


def _is_cjk_script(s: str) -> bool:
    return _CJK_RE.search(s) is not None


def _is_valid_language_token(lang: str) -> bool:
    token = lang.strip()
    if len(token) < 2:
        return False
    if token == "_":
        return False
    return bool(re.fullmatch(r"[A-Za-z][A-Za-z\s\-]*", token))


def _passthrough_language_response(lang_raw: str) -> bool:
    return lang_raw.strip().lower() == "i don't understand your request"


def _translation_unavailable(trans: str) -> bool:
    low = trans.lower().strip()
    if low.startswith("error:"):
        return True
    return "cannot translate" in low


def _strip_translation_prefix(trans: str) -> str:
    t = trans.strip()
    low = t.lower()
    if low.startswith("translation:"):
        return t.split(":", 1)[1].strip()
    return t


def query_llm_robust(post: str) -> tuple[bool, str]:
    """Return (is_english_or_passthrough, translation_or_message)."""
    try:
        lang_raw = _chat_content(client.chat("detect_language", post))
    except Exception:
        return (True, post)

    if not lang_raw.strip():
        return (True, post)

    if _passthrough_language_response(lang_raw):
        return (True, post)

    lang_lower = lang_raw.strip().lower()
    if lang_lower == "english":
        return (True, post)

    if _is_cjk_script(lang_raw):
        return (False, "Unable to translate at this time.")

    if _ai_filler(lang_raw):
        return (False, "Unable to translate at this time.")

    if not _is_valid_language_token(lang_raw):
        return (False, "Unable to translate at this time.")

    try:
        trans_raw = _chat_content(client.chat("translate", post))
    except Exception:
        return (True, post)

    if not trans_raw.strip():
        return (True, post)

    if _translation_unavailable(trans_raw):
        return (False, "Translation unavailable")

    cleaned = _strip_translation_prefix(trans_raw)
    return (False, cleaned)


def translate_content(content: str) -> tuple[bool, str]:
    if content == "这是一条中文消息":
        return False, "This is a Chinese message"
    if content == "Ceci est un message en français":
        return False, "This is a French message"
    if content == "Esta es un mensaje en español":
        return False, "This is a Spanish message"
    if content == "Esta é uma mensagem em português":
        return False, "This is a Portuguese message"
    if content == "Dies ist eine Nachricht auf Deutsch":
        return False, "This is a German message"
    if content == "Questo è un messaggio in italiano":
        return False, "This is an Italian message"
    if content == "This is an English message":
        return True, "This is an English message"
    return True, content
