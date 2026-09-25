# guide section — "giving your agent memory"
# a checkpointer saves the conversation; a thread_id ties messages into one chat.
# run: python3 src/03_agent_with_memory.py

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_groq import ChatGroq
from langgraph.checkpoint.memory import InMemorySaver

load_dotenv()

model = ChatGroq(model="openai/gpt-oss-120b")

# the checkpointer saves conversation state between calls
agent = create_agent(
    model=model,
    tools=[],
    system_prompt="You are a helpful assistant. Be concise and accurate.",
    checkpointer=InMemorySaver(),
)

# a thread_id labels the conversation — same id = same memory
config = {"configurable": {"thread_id": "chat-1"}}

# first message
r1 = agent.invoke(
    {"messages": [{"role": "user", "content": "hi! my name is m0h."}]},
    config,
)
print(r1["messages"][-1].content)

# second message — same thread_id, so it remembers
r2 = agent.invoke(
    {"messages": [{"role": "user", "content": "what's my name?"}]},
    config,
)
print(r2["messages"][-1].content)
