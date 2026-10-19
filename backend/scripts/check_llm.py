"""Smoke test for the configured OpenAI-compatible LLM."""
from openai import OpenAI

from backend.app.config import settings


def main() -> None:
    client = OpenAI(
        api_key=settings.LLM_API_KEY,
        base_url=settings.LLM_BASE_URL,
    )

    response = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[
            {"role": "user", "content": "Reply with the single word OK."}
        ],
        temperature=0,
    )

    reply = response.choices[0].message.content or ""
    usage = response.usage

    print(f"Reply: {reply.strip()}")
    if usage:
        print(f"Token usage: prompt={usage.prompt_tokens}, completion={usage.completion_tokens}")

    if "OK" not in reply.upper():
        raise SystemExit("FAIL: LLM did not return OK.")

    print("PASS: LLM smoke test")


if __name__ == "__main__":
    main()