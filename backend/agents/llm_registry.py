"""LLM factory: Groq→Gemini fallback for most agents, Claude Haiku for Designer."""
import os
from langchain_core.language_models import BaseChatModel


def get_groq_with_fallback() -> BaseChatModel:
    """Groq llama-3.3-70b primary; Gemini 2.5 Flash fallback."""
    try:
        from langchain_groq import ChatGroq
        llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.3)
        llm.invoke("ping")
        return llm
    except Exception:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.3)


def get_designer_llm() -> BaseChatModel:
    """Claude Haiku for Designer — best script quality per dollar. Falls back to Groq."""
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    if anthropic_key:
        try:
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(
                model="claude-3-5-haiku-20241022",
                max_tokens=2048,
                temperature=0.7,
            )
        except Exception:
            pass
    return get_groq_with_fallback()
