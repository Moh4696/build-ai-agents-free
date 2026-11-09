"""One batched Claude call → {script, caption, title}. Search-as-Code: generative step, single call."""
import os, json, urllib.request

PROMPT = """You write UK politics short-form video scripts.

1. Web-search the biggest UK politics story of the last 24h.
2. Write a 30-40 second monologue script. 6th-grade reading level. Open with a negative hook ("if you're not watching this...", "this is the mistake everyone's making...").
3. Write a 50-word caption: 1-para summary, then 3 search-style questions, then 5 hashtags.
4. Write a <=90 char title.

Output ONLY valid JSON: {"title": "...", "script": "...", "caption": "..."}"""

def generate(topic_override: str | None = None) -> dict:
    body = {
        "model": "claude-sonnet-4-6",
        "max_tokens": 1500,
        "messages": [{"role": "user", "content": PROMPT + (f"\n\nTopic override: {topic_override}" if topic_override else "")}],
        "tools": [{"type": "web_search_20250305", "name": "web_search"}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    data = json.loads(urllib.request.urlopen(req, timeout=120).read())
    text = "".join(b.get("text", "") for b in data["content"] if b["type"] == "text")
    text = text[text.find("{"): text.rfind("}") + 1]  # strip any fencing
    out = json.loads(text)
    assert all(k in out for k in ("title", "script", "caption"))
    return out

if __name__ == "__main__":
    print(json.dumps(generate(), indent=2))
