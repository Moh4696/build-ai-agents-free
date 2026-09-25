# guide — the complete agent (bonus: all three upgrades combined)
# provider fallback (groq -> gemini) + tools (search + word_count) + memory.
# needs GROQ_API_KEY and GOOGLE_API_KEY in .env
# run: python3 src/agent.py

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools import DuckDuckGoSearchRun
from langgraph.checkpoint.memory import InMemorySaver

# load GROQ_API_KEY and GOOGLE_API_KEY from .env
load_dotenv()


# --- fallback: try groq first, fall back to gemini (both free) ---
def get_model():
    try:
        model = ChatGroq(model="openai/gpt-oss-120b")
        model.invoke("ping")  # quick test that it actually responds
        print("using groq")
        return model
    except Exception as e:
        print(f"groq failed ({e}); falling back to gemini")
        return ChatGoogleGenerativeAI(model="gemini-2.5-flash")


# --- tools: a prebuilt web search + a function you wrote yourself ---
search = DuckDuckGoSearchRun()  # free, no key


@tool
def word_count(text: str) -> int:
    """Count how many words are in a piece of text."""
    return len(text.split())


# --- memory: InMemorySaver keeps conversation state in RAM across calls ---
agent = create_agent(
    model=get_model(),
    tools=[search, word_count],
    system_prompt=(
        "You are a helpful assistant. Use your tools when they help answer "
        "accurately, and remember the conversation."
    ),
    checkpointer=InMemorySaver(),
)


def main():
    # same thread_id = same conversation
    config = {"configurable": {"thread_id": "chat-1"}}

    # turn 1 — give it something to remember + a task that needs tools
    r1 = agent.invoke(
        {"messages": [{"role": "user", "content": "my name is m0h. search for the latest langchain version, then tell me how many words your answer is."}]},
        config,
    )
    print(r1["messages"][-1].content)

    # turn 2 — same thread, so it should recall the name
    r2 = agent.invoke(
        {"messages": [{"role": "user", "content": "what's my name?"}]},
        config,
    )
    print(r2["messages"][-1].content)


if __name__ == "__main__":
    main()
