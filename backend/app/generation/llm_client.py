"""LLM API client for answer generation."""

import hashlib
import json
import logging
import time
from pathlib import Path

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    OpenAI,
    RateLimitError,
)

from app.config import settings

logger = logging.getLogger(__name__)

CACHE_DIR = Path("data/llm_cache")
MAX_RETRIES = 3
REQUEST_TIMEOUT = 30.0
MAX_OUTPUT_TOKENS = 1000


def _cache_key(provider: str, model: str, system: str | None, prompt: str) -> str:
    """Create a stable hash for the request."""
    payload = json.dumps(
        [provider, model, system, prompt],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"


def generate(prompt: str, system: str | None = None) -> tuple[str, int | None]:
    """Generate an answer and return (answer text, total tokens used)."""
    provider = settings.LLM_PROVIDER.lower()
    model = settings.LLM_MODEL

    if provider not in {"openai", "anthropic"}:
        raise ValueError(f"Unsupported LLM provider: {provider}")

    key = _cache_key(provider, model, system, prompt)
    cache_path = _cache_path(key)

    if settings.LLM_CACHE_ENABLED and cache_path.exists():
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            logger.info("LLM cache hit: model=%s tokens=0", model)
            return cached["text"], 0
        except (OSError, json.JSONDecodeError, KeyError, TypeError):
            logger.warning("Ignoring invalid LLM cache entry: %s", cache_path)

    if provider == "anthropic":
        raise NotImplementedError("Anthropic provider is not implemented yet")

    client = OpenAI(
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL or None,
        timeout=REQUEST_TIMEOUT,
        max_retries=0,
    )

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    for attempt in range(MAX_RETRIES):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0,
                max_tokens=MAX_OUTPUT_TOKENS,
            )
            text = response.choices[0].message.content or ""
            usage = response.usage
            total_tokens = usage.total_tokens if usage else None

            logger.info(
                "LLM cache miss: model=%s tokens=%s",
                model,
                total_tokens,
            )

            if settings.LLM_CACHE_ENABLED:
                CACHE_DIR.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(
                    json.dumps({"text": text}, ensure_ascii=False),
                    encoding="utf-8",
                )

            return text, total_tokens

        except RateLimitError:
            if attempt == MAX_RETRIES - 1:
                raise
        except (APIConnectionError, APITimeoutError):
            if attempt == MAX_RETRIES - 1:
                raise
        except APIStatusError as exc:
            if exc.status_code < 500 or attempt == MAX_RETRIES - 1:
                raise

        delay = 2**attempt
        logger.warning(
            "Temporary LLM request failure; retrying in %s seconds (attempt %s/%s)",
            delay,
            attempt + 1,
            MAX_RETRIES,
        )
        time.sleep(delay)

    raise RuntimeError("LLM request failed after retries")