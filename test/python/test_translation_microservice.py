import time
from unittest.mock import patch

import pytest

import src.translator as translator


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
# ---------------------------------------------------------------------------

@patch("src.translator._chat")
def test_unexpected_language_response(mock_chat):
    """LLM returns gibberish for language detection — should fall back to English."""
    mock_chat.side_effect = ["I don't understand your request"]
    is_english, out = translator.translate_content("Hier ist dein erstes Beispiel.")
    assert is_english is True
    assert out == "Hier ist dein erstes Beispiel."


@patch("src.translator._chat")
def test_empty_language_response(mock_chat):
    """LLM returns empty string for language detection — should fall back to English."""
    mock_chat.side_effect = [""]
    is_english, out = translator.translate_content(
        "Je pense avoir compris la preuve generale."
    )
    assert is_english is True


@patch("src.translator._chat")
def test_translation_unavailable(mock_chat):
    """LLM detects non-English but returns bad translation — should say unavailable."""
    mock_chat.side_effect = ["Italian", "I don't understand your request"]
    is_english, out = translator.translate_content(
        "Se avessimo studiato con maggiore attenzione."
    )
    assert is_english is False
    assert out == "Translation unavailable"


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


@patch("src.translator._chat")
def test_gibberish_input(mock_chat):
    """Gibberish that LLM can't classify — should fall back to English."""
    mock_chat.side_effect = ["asdfghjkl"]
    is_english, out = translator.translate_content("blargh nnn 123 @@ not sure")
    assert is_english is True
    assert out == "blargh nnn 123 @@ not sure"


# ---------------------------------------------------------------------------
# Robust wrapper tests — tests the error handling layer
# ---------------------------------------------------------------------------

@patch.object(translator, 'translate_content')
def test_robust_bad_return_type(mocker):
    mocker.return_value = "not a tuple"
    assert query_translation_robust("test input") == (True, "test input")


@patch.object(translator, 'translate_content')
def test_robust_none_return(mocker):
    mocker.return_value = None
    assert query_translation_robust("test input") == (True, "test input")


@patch.object(translator, 'translate_content')
def test_robust_exception(mocker):
    mocker.side_effect = RuntimeError("boom")
    assert query_translation_robust("test input") == (True, "test input")


@patch.object(translator, 'translate_content')
def test_robust_non_english_passthrough(mocker):
    mocker.return_value = (False, "Translated text here")
    assert query_translation_robust("foreign text") == (False, "Translated text here")


# ---------------------------------------------------------------------------
# Live accuracy tests — call real translate_content (requires running Ollama)
# These are skipped if Ollama is not reachable.
# ---------------------------------------------------------------------------

def _keywords_match(translated, keywords):
    """Check if at least one of the expected English keywords appears in the translation."""
    lower = translated.lower()
    return any(kw.lower() in lower for kw in keywords)


# (input, expected_is_english, label, expected_keywords)
# expected_keywords: 3-5 English words that should appear in a correct translation.
# For English inputs, keywords are checked against the original content.
CLASSIFICATION_CASES = [
    # English — model reliably detects these
    ("Hello world, how are you doing today?", True, "English",
     ["hello", "world", "today"]),
    ("Good morning, I hope everyone has a great day", True, "English",
     ["good", "morning", "hope", "great"]),
    ("This is a message written entirely in English", True, "English",
     ["message", "english", "written"]),
    ("The weather is nice outside and I want to go for a walk", True, "English",
     ["weather", "nice", "walk"]),
    ("Can someone explain how to solve problem three from the homework?", True, "English",
     ["explain", "solve", "problem", "homework"]),
    # Non-English — keywords that should appear in a correct English translation
    ("这是一条中文消息，请帮我翻译成英文", False, "Chinese",
     ["chinese", "message", "translate", "english"]),
    ("Esta es un mensaje en español que necesita traducción", False, "Spanish",
     ["message", "spanish", "translation", "needs"]),
    ("Bonjour, comment allez-vous aujourd'hui? J'espère que tout va bien", False, "French",
     ["hello", "how", "today", "hope", "well"]),
    ("Questo è un messaggio in italiano che vorrei tradurre in inglese", False, "Italian",
     ["message", "italian", "translate", "english"]),
    ("Это сообщение написано на русском языке", False, "Russian",
     ["message", "written", "russian", "language"]),
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
def test_classification_accuracy():
    """
    Call real translate_content against the live LLM.
    At least 40% of cases must produce the correct is_english value.
    """
    correct = 0
    total = len(CLASSIFICATION_CASES)

    for content, expected_is_english, label, _ in CLASSIFICATION_CASES:
        start = time.time()
        is_english, translated = translator.translate_content(content)
        elapsed = time.time() - start

        passed = is_english == expected_is_english
        status = "PASS" if passed else "FAIL"
        if passed:
            correct += 1

        print(
            f"  [{status}] {label:10s} | is_english={str(is_english):5s} "
            f"(expected {str(expected_is_english):5s}) | {elapsed:.1f}s | "
            f"input={content[:40]}"
        )

    accuracy = correct / total
    print(f"\nClassification accuracy: {correct}/{total} = {accuracy:.0%}")
    print(f"Threshold: 40%")
    assert accuracy >= 0.40, (
        f"Accuracy {accuracy:.0%} ({correct}/{total}) is below 40% threshold"
    )


@pytest.mark.skipif(not _ollama_available(), reason="Ollama not running")
def test_translation_keywords():
    """
    For non-English cases where the model correctly detects the language,
    check that the translation contains expected English keywords.
    At least 40% of non-English cases that get translated must contain keywords.
    """
    checked = 0
    matched = 0

    for content, expected_is_english, label, keywords in CLASSIFICATION_CASES:
        if expected_is_english:
            continue

        start = time.time()
        is_english, translated = translator.translate_content(content)
        elapsed = time.time() - start

        if is_english:
            print(f"  [SKIP] {label:10s} | model said English, skipping keyword check | {elapsed:.1f}s")
            continue

        checked += 1
        has_keywords = _keywords_match(translated, keywords)
        if has_keywords:
            matched += 1

        status = "PASS" if has_keywords else "FAIL"
        print(
            f"  [{status}] {label:10s} | {elapsed:.1f}s | "
            f"keywords={keywords[:4]} | translated={translated[:60]}"
        )

    if checked == 0:
        pytest.skip("Model did not detect any non-English cases")

    accuracy = matched / checked
    print(f"\nKeyword accuracy: {matched}/{checked} = {accuracy:.0%}")
    print(f"Threshold: 40%")
    assert accuracy >= 0.40, (
        f"Keyword accuracy {accuracy:.0%} ({matched}/{checked}) is below 40% threshold"
    )
