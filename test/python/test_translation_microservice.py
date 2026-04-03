import math
import time
from unittest.mock import patch

import pytest

import src.translator as translator
from src.translator import _normalize_translation_response


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def query_translation_robust(post):
    """Wrap translate_content with error handling; fall back to (True, post)."""
    try:
        result = translator.translate_content(post)
    except Exception:
        return (True, post)

    if not isinstance(result, tuple) or len(result) != 2:
        return (True, post)

    is_english, translated_content = result
    if not isinstance(is_english, bool) or not isinstance(translated_content, str):
        return (True, post)

    if is_english:
        return (True, post)

    return (False, translated_content)


# ---------------------------------------------------------------------------
# Mock tests — failure/edge cases where we mock _chat to simulate LLM issues
# (Translator repo unit tests own the "I don't understand" language-detection path.)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "language_label,post",
    [
        ("", "Je pense avoir compris la preuve generale."),
        ("asdfghjkl", "blargh nnn 123 @@ not sure"),
    ],
    ids=["empty_language_label", "gibberish_language_label"],
)
@patch("src.translator._chat")
def test_language_label_unparsed_falls_back_english(mock_chat, language_label, post):
    """First-call language is empty vs unmapped token: same fallback (English, original post)."""
    mock_chat.side_effect = [language_label]
    is_english, out = translator.translate_content(post)
    assert is_english is True
    assert out == post


@patch("src.translator._chat")
def test_translation_unavailable(mock_chat):
    """LLM detects non-English but returns bad translation — should say unavailable."""
    mock_chat.side_effect = ["Italian", "I don't understand your request"]
    is_english, out = translator.translate_content(
        "Se avessimo studiato con maggiore attenzione."
    )
    assert is_english is False
    assert out == "Translation unavailable"


@pytest.mark.parametrize(
    "bad_translation",
    ["", "   \t  "],
    ids=["empty", "whitespace_only"],
)
@patch("src.translator._chat")
def test_translation_empty_or_whitespace_unavailable(mock_chat, bad_translation):
    """Second LLM call is empty or whitespace-only after strip → Translation unavailable."""
    mock_chat.side_effect = ["French", bad_translation]
    is_english, out = translator.translate_content("Bonjour tout le monde")
    assert is_english is False
    assert out == "Translation unavailable"


@patch("src.translator._chat")
def test_translation_prefix_stripped(mock_chat):
    """Prefixes like 'Translation:' should not leak into the stored English text."""
    mock_chat.side_effect = ["German", "Translation: Here is one example."]
    is_english, out = translator.translate_content("Hier ist ein erstes Beispiel.")
    assert is_english is False
    assert out == "Here is one example."


@patch("src.translator._chat")
def test_llm_exception(mock_chat):
    """LLM throws an exception — should fall back to English."""
    mock_chat.side_effect = Exception("connection refused")
    is_english, out = translator.translate_content("Hello World!")
    assert is_english is True
    assert out == "Hello World!"


def test_empty_content():
    """Empty/whitespace input should return English immediately — no LLM call needed."""
    is_english, out = translator.translate_content("   ")
    assert is_english is True


# ---------------------------------------------------------------------------
# Robust wrapper tests — tests the error handling layer
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "return_value,side_effect",
    [
        ("not a tuple", None),
        (None, None),
        (None, RuntimeError("boom")),
    ],
    ids=["bad_return_type", "none_return", "exception"],
)
@patch.object(translator, 'translate_content')
def test_robust_translate_content_failures(mocker, return_value, side_effect):
    mocker.return_value = return_value
    mocker.side_effect = side_effect
    assert query_translation_robust("test input") == (True, "test input")


@patch.object(translator, 'translate_content')
def test_robust_non_english_passthrough(mocker):
    mocker.return_value = (False, "Translated text here")
    assert query_translation_robust("foreign text") == (False, "Translated text here")


# ---------------------------------------------------------------------------
# Live accuracy tests — call real translate_content (requires running Ollama)
# These are skipped if Ollama is not reachable.
# ---------------------------------------------------------------------------

def _translation_keyword_metric(translated, source_text, keywords):
    """
    CI-safe quality bar for English translations: reuse the service's own rejection
    rules via _normalize_translation_response only, require real change vs source,
    and require multiple keyword hits (absolute + ratio) instead of any single match.
    """
    if not isinstance(translated, str):
        return False
    normalized = _normalize_translation_response(translated)
    if normalized is None:
        return False
    candidate = normalized.strip()
    if candidate == (source_text or "").strip():
        return False

    lower = candidate.lower()
    matched = sum(1 for kw in keywords if kw.lower() in lower)
    n = len(keywords) if keywords else 0
    if n == 0:
        return False
    need = max(2, math.ceil(0.35 * n))
    return matched >= need


# Short fixture list for one integration smoke test (single translate_content call per row).
# (input, expected_is_english, label, expected_keywords)
CLASSIFICATION_CASES = [
    ("Hello world, how are you doing today?", True, "English",
     ["hello", "world", "today"]),
    ("Good morning, I hope everyone has a great day", True, "English",
     ["good", "morning", "hope", "great"]),
    ("This is a message written entirely in English", True, "English",
     ["message", "english", "written"]),
    ("这是一条中文消息，请帮我翻译成英文", False, "Chinese",
     ["chinese", "message", "translate", "english"]),
    ("Esta es un mensaje en español que necesita traducción", False, "Spanish",
     ["message", "spanish", "translation", "needs"]),
    ("Bonjour, comment allez-vous aujourd'hui? J'espère que tout va bien", False, "French",
     ["hello", "how", "today", "hope", "well"]),
]


def _ollama_available():
    """Check if Ollama is reachable via the configured OLLAMA_HOST."""
    import os
    try:
        import urllib.request
        host = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
        if not host.startswith("http"):
            host = f"http://{host}"
        urllib.request.urlopen(host, timeout=3)
        return True
    except Exception:
        print("Ollama not running")
        return False


@pytest.mark.skipif(not _ollama_available(), reason="Ollama not running")
def test_live_translate_smoke():
    """
    One LLM round-trip per row: classification smoke plus keyword check when the model
    flags non-English. Full live matrices stay in the translator repo; this is not a second suite.
    """
    total = len(CLASSIFICATION_CASES)
    correct_class = 0
    kw_checked = 0
    kw_matched = 0

    for content, expected_is_english, label, keywords in CLASSIFICATION_CASES:
        start = time.time()
        is_english, translated = translator.translate_content(content)
        elapsed = time.time() - start

        class_ok = is_english == expected_is_english
        if class_ok:
            correct_class += 1
        cstatus = "PASS" if class_ok else "FAIL"
        print(
            f"  [{cstatus}] {label:10s} | is_english={str(is_english):5s} "
            f"(expected {str(expected_is_english):5s}) | {elapsed:.1f}s | "
            f"input={content[:40]}"
        )

        if not expected_is_english:
            if is_english:
                print(
                    f"  [SKIP_KW] {label:10s} | model said English, skipping keyword check | "
                    f"{elapsed:.1f}s"
                )
            else:
                kw_checked += 1
                has_kw = _translation_keyword_metric(translated, content, keywords)
                if has_kw:
                    kw_matched += 1
                kstatus = "PASS" if has_kw else "FAIL"
                print(
                    f"  [{kstatus}_KW] {label:10s} | {elapsed:.1f}s | "
                    f"keywords={keywords[:4]} | translated={translated[:60]}"
                )

    class_acc = correct_class / total
    print(f"\nClassification: {correct_class}/{total} = {class_acc:.0%} (threshold 40%)")
    assert class_acc >= 0.40, (
        f"Classification {class_acc:.0%} ({correct_class}/{total}) is below 40% threshold"
    )

    if kw_checked == 0:
        pytest.skip("Model did not detect any non-English cases")

    kw_acc = kw_matched / kw_checked
    print(f"Keywords (when non-English): {kw_matched}/{kw_checked} = {kw_acc:.0%} (threshold 40%)")
    assert kw_acc >= 0.40, (
        f"Keyword accuracy {kw_acc:.0%} ({kw_matched}/{kw_checked}) is below 40% threshold"
    )
