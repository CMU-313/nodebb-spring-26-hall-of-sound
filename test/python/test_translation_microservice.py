import pytest

from src.translator import translate_content


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
def test_translate_content_current_hardcoded_cases(content, expected_is_english, expected_translation):
    is_english, translated_content = translate_content(content)
    assert is_english is expected_is_english
    assert translated_content == expected_translation


def test_llm_normal_response():
    is_english, translated_content = translate_content("Dies ist eine Nachricht auf Deutsch")
    assert is_english is False
    assert translated_content == "This is a German message"


def test_llm_gibberish_response():
    is_english, translated_content = translate_content("blargh nnn 123 @@ not sure")
    assert is_english is True
    assert translated_content == "blargh nnn 123 @@ not sure"


# Future LLM robustness tests.
# Keep these in the NodeBB repo for the later LLM integration, but do not run them yet.
#
# from mock import patch
#
# @patch.object(client, 'chat')
# def test_unexpected_language(mocker):
#   # we mock the model's response to return a random message
#   mocker.return_value.message.content = "I don't understand your request"
#
#   # TODO assert the expected behavior
#   assert query_llm_robust("Hier ist dein erstes Beispiel.")
#
# @patch.object(client, 'chat')
# def test_empty_string(mocker):
#   # we mock the model's response to return an empty message
#   mocker.return_value.message.content = ""
#
#   # TODO assert the expected behavior
#   assert query_llm_robust("Je pense avoir compris la preuve generale, mais je ne vois toujours pas pourquoi la condition finale est necessaire dans le cas discret.")
#
# @patch.object(client, 'chat')
# def test_llm_returning_back_input(mocker):
#   # we mock the model's response to return the same message back
#   mocker.return_value.message.content = "No entendi muy bien la solucion publicada. En la segunda linea parece que se usa una identidad que no vimos en clase."
#
#   # TODO assert the expected behavior
#   assert query_llm_robust("No entendi muy bien la solucion publicada. En la segunda linea parece que se usa una identidad que no vimos en clase.")
#
# @patch.object(client, 'chat')
# def test_llm_explicitly_not_returning_success_keyword(mocker):
#   # we mock the model's response to return a response without the SUCCESS keyword
#   mocker.return_value.message.content = "I don't understand your request FAILURE"
#
#   # TODO assert the expected behavior
#   assert query_llm_robust("Se avessivo studiato con maggiore attenzione, forse avremmo evitato quell errore nel quiz.")
#
# @patch.object(client, 'chat')
# def test_llm_returning_success_keyword_in_wrong_position(mocker):
#   # we mock the model's response to return the success keyword but in the wrong position
#   mocker.return_value.message.content = "SUCCESS - here is the translation: Hello World!"
#
#   # TODO assert the expected behavior
#   assert query_llm_robust("Hello World!")
