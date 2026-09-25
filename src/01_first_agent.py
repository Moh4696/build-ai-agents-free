# guide section — "your first agent"
# a complete, working agent: free groq model + a system prompt, no tools yet.
# run: python3 src/01_first_agent.py

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_groq import ChatGroq

# load your GROQ_API_KEY from the .env file
load_dotenv()

# the brain: a free groq model
model = ChatGroq(model="openai/gpt-oss-120b")

# the agent: model + a system prompt telling it how to behave
agent = create_agent(
    model=model,
    tools=[],
    system_prompt="You are a helpful assistant. Be concise and accurate.",
)

# ask it something
result = agent.invoke(
    {"messages": [{"role": "user", "content": "explain what an AI agent is in two sentences."}]}
)

# print the agent's reply
print(result["messages"][-1].content)
