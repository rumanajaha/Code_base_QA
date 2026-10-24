import json

import pytest
from openai import APIConnectionError

from app.generation import llm_client


class FakeUsage:
    total_tokens = 42


class FakeMessage:
    content = "Generated answer"


class FakeChoice:
    message = FakeMessage()


class FakeResponse:
    choices = [FakeChoice()]
    usage = FakeUsage()


class FakeCompletions:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = 0

    def create(self, **kwargs):
        self.calls += 1
        response = next(self.responses)
        if isinstance(response, Exception):
            raise response
        return response


class FakeChat:
    def __init__(self, completions):
        self.completions = completions


class FakeClient:
    def __init__(self, completions, **kwargs):
        self.chat = FakeChat(completions)


def test_generate_uses_cache_on_second_call(monkeypatch, tmp_path):
    completions = FakeCompletions([FakeResponse()])
    monkeypatch.setattr(llm_client, "OpenAI", lambda **kwargs: FakeClient(completions, **kwargs))
    monkeypatch.setattr(llm_client, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(llm_client.settings, "LLM_CACHE_ENABLED", True)
    monkeypatch.setattr(llm_client.settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(llm_client.settings, "LLM_MODEL", "test-model")
    monkeypatch.setattr(llm_client.settings, "LLM_BASE_URL", "https://example.test/v1")

    first = llm_client.generate("Test prompt", system="Test system")
    second = llm_client.generate("Test prompt", system="Test system")

    assert first == ("Generated answer", 42)
    assert second == ("Generated answer", 0)
    assert completions.calls == 1


def test_generate_retries_connection_error(monkeypatch, tmp_path):
    completions = FakeCompletions(
        [APIConnectionError(request=None), FakeResponse()]
    )
    monkeypatch.setattr(llm_client, "OpenAI", lambda **kwargs: FakeClient(completions, **kwargs))
    monkeypatch.setattr(llm_client, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(llm_client.settings, "LLM_CACHE_ENABLED", False)
    monkeypatch.setattr(llm_client.settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(llm_client.settings, "LLM_MODEL", "test-model")
    monkeypatch.setattr(llm_client.settings, "LLM_BASE_URL", "https://example.test/v1")
    monkeypatch.setattr(llm_client.time, "sleep", lambda _: None)

    result = llm_client.generate("Retry me")

    assert result == ("Generated answer", 42)
    assert completions.calls == 2