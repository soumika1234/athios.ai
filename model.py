"""Athios model interface.

The web app calls generate() and nothing else. The version below is a small rule-based
stand-in so the chat page works today. To connect the trained Athios transformer, replace
the body of generate(): build the model input from `history` and `prompt`, run the model,
and yield the decoded text piece by piece.
"""
import re
import time

NAME = re.compile(r"\bmy name is ([A-Za-z]+)", re.I)


def _known_name(history):
    for m in reversed(history):
        if m["role"] == "user":
            hit = NAME.search(m["content"])
            if hit:
                return hit.group(1).capitalize()
    return None


def _reply(history, prompt):
    p = prompt.lower().strip()
    users = [m["content"] for m in history if m["role"] == "user"]
    hit = NAME.search(prompt)
    if hit:
        return f"Nice to meet you, {hit.group(1).capitalize()}. I will remember your name in this chat."
    if re.search(r"what(?:'s| is) my name|who am i", p):
        name = _known_name(history)
        return f"Your name is {name}." if name else "You haven't told me your name yet."
    if re.search(r"earlier|before|last time|previous|remember", p):
        if users:
            return f'Earlier you said: "{users[-1][:120]}". I keep every message in this chat as memory.'
        return "This is the start of our chat, so there is nothing earlier yet."
    if re.search(r"\bcode\b|python|function|example", p):
        return ("Here is a small example:\n\n```python\ndef greet(name):\n    return f'Hello, {name}!'\n```\n\n"
                "I'm running in demo mode, so this is a canned answer. Connect the trained model in model.py for real ones.")
    if re.match(r"(hi|hello|hey)\b", p):
        return "Hello! I am Athios. What would you like to talk about?"
    if re.search(r"\bthank", p):
        return "You're welcome!"
    recall = f" Earlier you also asked: '{users[-1][:60]}'." if users else ""
    return (f"I'm running in demo mode, so I can't answer that properly yet. You asked: '{prompt[:80]}'.{recall} "
            "Connect the trained Athios model in model.py to get real answers.")


def generate(history, prompt, temperature=0.7, max_tokens=200):
    """Yield the reply piece by piece. history = [{"role": "user" | "assistant", "content": str}, ...]"""
    # temperature is ignored by the stand-in; a real model would use it when sampling.
    for piece in re.findall(r"\S+\s*", _reply(history, prompt))[:max_tokens]:
        yield piece
        time.sleep(0.03)
