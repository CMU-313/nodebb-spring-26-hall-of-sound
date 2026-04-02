"""Consolidated LLM robustness tests (mocks only; no Ollama or network)."""

import importlib.util
from pathlib import Path
from unittest.mock import patch

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
_LOCAL_TRANSLATOR = _REPO_ROOT / "src" / "translator.py"


def _load_local_translator():
    spec = importlib.util.spec_from_file_location(
        "_hall_of_sound_translator",
        _LOCAL_TRANSLATOR,
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load translator from {_LOCAL_TRANSLATOR}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


translator = _load_local_translator()


@pytest.mark.parametrize(
    ("content", "expected_is_english", "expected_translation"),
    [
        ("这是一条中文消息", False, "This is a Chinese message"),
        ("Ceci est un message en français", False, "This is a French message"),
        ("Esta es un mensaje en español", False, "This is a Spanish message"),
        ("Esta é uma mensagem em português", False, "This is a Portuguese message"),
        ("Dies ist eine Nachricht auf Deutsch", False, "This is a German message"),
        ("Questo è un messaggio in italiano", False, "This is an Italian message"),
        ("This is an English message", True, "This is an English message"),
        ("??? ... asdf qwer zzzz", True, "??? ... asdf qwer zzzz"),
    ],
)
def test_translate_content_current_hardcoded_cases(
    content, expected_is_english, expected_translation
):
    is_english, translated_content = translator.translate_content(content)
    assert is_english is expected_is_english
    assert translated_content == expected_translation


def test_translate_content_german_message():
    is_english, translated_content = translator.translate_content(
        "Dies ist eine Nachricht auf Deutsch"
    )
    assert is_english is False
    assert translated_content == "This is a German message"


def test_translate_content_gibberish_treated_as_english():
    is_english, translated_content = translator.translate_content("blargh nnn 123 @@ not sure")
    assert is_english is True
    assert translated_content == "blargh nnn 123 @@ not sure"


@patch.object(translator.client, "chat")
def test_query_llm_robust_unexpected_language_text_from_model(mock_chat):
    mock_chat.return_value = "I don't understand your request"
    assert translator.query_llm_robust("Hier ist dein erstes Beispiel.") == (
        True,
        "Hier ist dein erstes Beispiel.",
    )


@patch.object(translator.client, "chat")
def test_query_llm_robust_empty_language_response(mock_chat):
    mock_chat.return_value = ""
    assert translator.query_llm_robust("Hier ist dein erstes Beispiel.") == (
        True,
        "Hier ist dein erstes Beispiel.",
    )


@patch.object(translator.client, "chat")
def test_query_llm_robust_translation_unavailable_after_foreign_language(mock_chat):
    mock_chat.side_effect = [
        "German",
        "Error: cannot translate this input",
    ]
    assert translator.query_llm_robust("Hier ist dein erstes Beispiel.") == (
        False,
        "Translation unavailable",
    )


@patch.object(translator.client, "chat")
def test_query_llm_robust_model_exception_fallback(mock_chat):
    mock_chat.side_effect = Exception("Model server crashed")
    assert translator.query_llm_robust("Hier ist dein erstes Beispiel.") == (
        True,
        "Hier ist dein erstes Beispiel.",
    )


@patch.object(translator.client, "chat")
def test_query_llm_robust_verbose_translation_prefix_stripped(mock_chat):
    mock_chat.side_effect = [
        "German",
        "Translation: Here is your first example.",
    ]
    assert translator.query_llm_robust("Hier ist dein erstes Beispiel.") == (
        False,
        "Here is your first example.",
    )


@patch.object(translator.client, "chat")
def test_query_llm_robust_ai_filler_offer_fails_gracefully(mock_chat):
    mock_chat.return_value = "I can translate this if you want"
    assert translator.query_llm_robust("Hier ist dein erstes Beispiel.") == (
        False,
        "Unable to translate at this time.",
    )


@patch.object(translator.client, "chat")
def test_query_llm_robust_ai_chatter_fails_gracefully(mock_chat):
    mock_chat.return_value = "As an AI language model, I cannot do that."
    assert translator.query_llm_robust("Hier ist ein Beispiel.") == (
        False,
        "Unable to translate at this time.",
    )


@patch.object(translator.client, "chat")
def test_query_llm_robust_non_latin_cjk_detection_response(mock_chat):
    mock_chat.return_value = "这是一条测试信息。"
    assert translator.query_llm_robust("这是一条测试信息。") == (
        False,
        "Unable to translate at this time.",
    )


@patch.object(translator.client, "chat")
def test_query_llm_robust_successful_translation_flow(mock_chat):
    mock_chat.side_effect = [
        "Spanish",
        "How are you?",
    ]
    assert translator.query_llm_robust("¿Cómo estás?") == (False, "How are you?")


@patch.object(translator.client, "chat")
def test_query_llm_robust_malformed_language_prefix_fails(mock_chat):
    mock_chat.side_effect = [
        "_",
        "Translation: This is a test.",
    ]
    assert translator.query_llm_robust("Ceci est un test.") == (
        False,
        "Unable to translate at this time.",
    )
