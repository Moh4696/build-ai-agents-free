# guide section — "the fallback setup"
# try groq first; if it fails (rate limit / removed model / outage), fall back to gemini.
# extra install: python3 -m pip install -U langchain-google-genai
# needs GROQ_API_KEY and GOOGLE_API_KEY in .env
# run: python3 src/04_agent_with_fallback.py

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()


# define your providers in order of preference — all free
def get_model():
    try:
        # first choice: groq (fastest)
        model = ChatGroq(model="openai/gpt-oss-120b")
        model.invoke("ping")  # quick test that it actually responds
        print("using groq")
        return model
    except Exception as e:
        # groq is down or rate-limited — fall back to gemini
        print(f"groq failed ({e}); falling back to gemini")
        return ChatGoogleGenerativeAI(model="gemini-2.5-flash")


agent = create_agent(
    model=get_model(),
    tools=[],
    system_prompt="You are a helpful assistant. Be concise and accurate.",
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "say hi and tell me which model you are."}]}
)
print(result["messages"][-1].content)
