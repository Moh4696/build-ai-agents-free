# How to Build AI Agents Completely Free in 2026

> **Android without Termux:** use the ready-to-run [Google Colab notebook](colab/Build_AI_Agents_Free.ipynb), or build and install the [native Free AI Agent app](android-app/README.md).


### the ultimate beginner's guide

**$0 · no credit card · no prior experience · open-source**

building an AI agent shouldn't be something only engineers get to do. it should be
simple enough that anyone willing to follow along can build one that actually works.

and here's the thing most "build an AI agent" tutorials won't tell you: they sneak
in a paid API key around step 3. this one doesn't. you can build a real, working
agent — one that reasons, calls tools, and loops until a task is done — without
spending a cent. no credit card, no trial that expires, no bait-and-switch. and no
prior experience needed.

---

## the free stack

everything here is free, forever:

- **langchain + langgraph — the framework.** MIT-licensed, hit 1.0 this year, and
  its new `create_agent` is the fastest way to stand up an agent that actually
  works. langgraph also leads every open-source agent framework in enterprise
  adoption, with **34.5M downloads a month** (per firecrawl's 2026 framework
  report). → https://github.com/langchain-ai/langchain
- **groq (or google's gemini free tier) — the brain.** groq runs open models like
  llama 3.3 70b at **~300 tokens/sec** and hands out **~14,400 requests a day** with
  no card. gemini gives you **1,500 requests/day** and a **million-token context
  window** if you'd rather. → https://console.groq.com · https://aistudio.google.com
- **your own machine — that's it.** python and a text editor.

> **one honest catch up front:** "free" tiers change monthly and most of them train
> on your prompts. keep anything sensitive off them. we'll cover the fallback setup
> so a provider quietly killing a model doesn't take your agent down with it.

by the end you'll have an agent that can search, use a tool you wrote yourself, and
remember a conversation — running entirely on $0.

---

## what an AI agent actually is 🤖

before we build one, let's clear up what an "agent" even means, because the word gets
thrown around a lot.

a normal **chatbot** does one thing: you ask, it answers. done. it can't look
anything up, can't take an action, can't check its own work. it just talks.

an **agent** is different. an agent is a model that runs in a **loop** — it thinks
about the task, does something, looks at the result, and decides what to do next. it
keeps going until the job is actually finished.

that loop has three moves:

1. **plan** — the model reads the task and decides what to do. *"the user wants
   today's weather in lagos. I don't know that. I should use the weather tool."*
2. **act** — it calls a tool. a web search, a calculator, a function you wrote,
   anything you give it access to.
3. **observe** — it reads what the tool gave back, then loops. either it has enough
   to answer, or it plans the next step.

that's the whole trick. a chatbot is a mouth. an agent is a mouth with hands and
eyes. it can reach out into the world, see what happened, and adjust.

the model provides the reasoning. langchain wires up the loop and the tools. that's
what we're building.

---

## setup (5 minutes, still $0)

three things to install, one free key to grab. no credit card anywhere.

> 🎬 **watch the 90-second setup demo** *(silent screen recording of the folder +
> `.env` + `agent.py` steps below):*

https://github.com/Moh4696/build-ai-agents-free/releases/download/v1.0/buildagent.mp4

**a. python.** if you don't have it, get python 3.10 or newer from
[python.org](https://python.org). to check what you've got, open a terminal and run
(anything 3.10+ works):

```bash
python3 --version
```

**b. make a project folder.** somewhere easy to find, make a folder for this build
and move into it (everything else happens inside here):

```bash
mkdir my-agent
cd my-agent
```

**c. install langchain + groq.** one line:

```bash
pip install -U "langchain[groq]" python-dotenv
```

that pulls in langchain (the framework), the groq connector (so your agent can reach
groq's free models), and python-dotenv (which reads your key from a file). all in one
go.

**d. grab your free groq key.** go to
[console.groq.com](https://console.groq.com), sign in with google or github, and open
the **"API Keys"** tab. click create, copy the key. no card, no trial clock — it's
free to start.

**e. make your `.env` file.** this is where the key lives — a plain text file named
exactly `.env`, with the dot at the front and nothing after it. the dot makes it a
"hidden" file, which is normal. here's how to create it:

```bash
# mac / linux
touch .env

# windows
type nul > .env
```

then open that file in any text editor and paste your key in, like this:

```bash
GROQ_API_KEY=your_key_here
```

swap `your_key_here` for the key you copied. save it.

> **one rule:** never share this file, and never commit it to github. your key is a
> password — anyone who has it can run up your account. keeping it in `.env` keeps it
> out of your code and out of trouble.

that's the whole setup. python, one install, one free key. next we write the agent.

---

## your first agent

open `agent.py` and paste this in. this is a complete, working agent. it loads your
key, connects to a free groq model, and answers you. we'll go line by line right
after.

> 📄 in this repo: [`src/01_first_agent.py`](src/01_first_agent.py)

```python
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_groq import ChatGroq

# load your GROQ_API_KEY from the .env file
load_dotenv()

# the brain: a free groq model
model = ChatGroq(model="llama-3.3-70b-versatile")

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
```

run it:

```bash
python3 agent.py
```

after a second, you'll see the model answer in your terminal. that's your agent
running on a free model, no card, entirely from your own machine.

**what each part does:**

- `load_dotenv()` reads your groq key out of the `.env` file so the code can use it
  without the key ever being written into the code itself.
- `ChatGroq(model="llama-3.3-70b-versatile")` picks the brain. this is a free llama
  model served by groq, fast enough that replies feel instant.
- `create_agent(...)` builds the agent. right now `tools=[]` is empty, so this is
  really just a smart chatbot. the `system_prompt` is the standing instruction it
  follows every time.
- `agent.invoke(...)` sends it a message and runs the loop until it has an answer.
- `result["messages"][-1].content` grabs the last message in the conversation — the
  agent's reply — and prints it.

right now it can only talk. it has no tools, so if you ask it something it doesn't
know — today's news, a live price, anything real-time — it'll guess or admit it
can't. that's the next section: giving it tools, so it can actually go find things
out.

---

## giving your agent tools

right now your agent can only talk. **tools** are what turn it from a chatbot into
something that acts: it can search the web, run a calculation, hit an API, or call any
function you write. the model decides *when* to use a tool based on what you ask. you
just hand it the options.

we'll add two: a web search it didn't write, and a function you did.

first, one more free install (no key needed — duckduckgo search is free):

```bash
python3 -m pip install -U duckduckgo-search langchain-community
```

now update `agent.py`:

> 📄 in this repo: [`src/02_agent_with_tools.py`](src/02_agent_with_tools.py)

```python
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_groq import ChatGroq
from langchain_community.tools import DuckDuckGoSearchRun

load_dotenv()

model = ChatGroq(model="llama-3.3-70b-versatile")

# tool 1 — web search (prebuilt, free, no key)
search = DuckDuckGoSearchRun()

# tool 2 — a function you wrote yourself
@tool
def word_count(text: str) -> int:
    """Count how many words are in a piece of text."""
    return len(text.split())

# hand both tools to the agent
agent = create_agent(
    model=model,
    tools=[search, word_count],
    system_prompt="You are a helpful assistant. Use your tools when they help answer accurately.",
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "search for the latest langchain version, then tell me how many words your answer is."}]}
)

print(result["messages"][-1].content)
```

run it:

```bash
python3 agent.py
```

watch what happens: the agent reads your request, realizes it needs current info,
calls the search tool, reads the result, then calls your `word_count` tool on its own
answer. all in one loop, no extra code from you. that's the **plan → act → observe**
cycle running for real.

**the part that matters — how the agent knows what a tool does:**

look at the `word_count` function. two things make it a tool:

- the **`@tool` decorator** — that's what registers it so the agent can call it.
- the **docstring** `"""Count how many words are in a piece of text."""` — this isn't
  a comment for you, it's the description the model reads to decide *when* to use the
  tool. the type hints (`text: str → int`) tell it what to pass in and what it gets
  back.

that's the whole pattern. any python function becomes a tool: write the function, add
a clear docstring, slap `@tool` on top, drop it in the list. want your agent to check
your database, send an email, hit a weather API? same three steps.

> **one honest heads-up:** the free duckduckgo search rate-limits and will
> occasionally throw an error if you hammer it. that's normal for a no-key free tool.
> if it fails, wait a few seconds and rerun — and in the fallback section, we'll make
> the agent survive a tool failing instead of crashing.

---

## giving your agent memory

try this on your current agent: tell it your name, then in a second message ask what
your name is. it won't know. every time you call it, it starts from a blank slate — no
memory of what you just said.

that's because each `invoke` is independent. to make it remember, you give it two
things: a **checkpointer** (which saves the conversation) and a **thread_id** (a label
that says "these messages belong to the same chat").

update `agent.py`:

> 📄 in this repo: [`src/03_agent_with_memory.py`](src/03_agent_with_memory.py)

```python
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_groq import ChatGroq
from langgraph.checkpoint.memory import InMemorySaver

load_dotenv()

model = ChatGroq(model="llama-3.3-70b-versatile")

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
```

run it:

```bash
python3 agent.py
```

this time the second answer comes back with your name. the agent remembered because
both calls shared `thread_id: "chat-1"`, and the checkpointer held onto the history in
between.

**the mental model:**

- the **checkpointer** is the notebook. it writes down the conversation after every
  turn.
- the **thread_id** is which page of the notebook you're on. same id, same page, same
  memory. change the id to `"chat-2"` and you start a fresh conversation with no
  history — handy when one agent serves different users.

> **one honest limit:** `InMemorySaver` keeps memory in your computer's RAM, so it
> vanishes the moment your script stops. that's fine for learning and prototyping. for
> a real app that remembers across restarts, you swap it for a database-backed
> checkpointer (langchain has ones for postgres and redis). same `thread_id` idea,
> just written to disk instead of memory. we're staying free and local, so
> `InMemorySaver` is exactly right for now.

---

## the fallback setup

### (so a dead free tier doesn't kill your agent)

here's the thing nobody tells you in the tutorial: **free tiers change without
warning.** a provider tightens a rate limit, or quietly deletes the exact model your
code was calling, and your agent — which you didn't touch — suddenly throws errors.
this actually happens. one dev woke up to a dead pipeline because a provider removed a
model overnight.

the fix is simple: **don't bet everything on one provider.** set up a backup, so if
groq is down or rate-limited, your agent falls back to gemini (or a local model) and
keeps running.

first, add a second free provider. we'll use google's gemini free tier as the backup:

```bash
python3 -m pip install -U langchain-google-genai
```

grab a free gemini key at [aistudio.google.com](https://aistudio.google.com) (google
account, no card), and add it to your `.env`:

```bash
GROQ_API_KEY=your_groq_key
GOOGLE_API_KEY=your_gemini_key
```

now make a model that fails over. the idea: try to build the agent on groq. if that
provider errors out, catch it and rebuild on gemini instead — same tools, same
everything.

> 📄 in this repo: [`src/04_agent_with_fallback.py`](src/04_agent_with_fallback.py)

```python
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

# define your providers in order of preference — all free
def get_model():
    try:
        # first choice: groq (fastest)
        model = ChatGroq(model="llama-3.3-70b-versatile")
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
```

now if groq is having a bad day, your agent quietly switches to gemini and keeps
working. you can chain a third provider the same way — add another `except` layer for
openrouter, or a local ollama model that needs no key at all.

**why this pattern and not a fancier one:** langchain has a built-in
`with_fallbacks()`, but as of 2026 it doesn't always play nicely when handed straight
to an agent — it can throw a confusing error. the plain `try/except` above is boring,
but it works every time, and you can read exactly what it does. boring and reliable
beats clever and fragile.

> **the rule to remember:** never hardcode a single free model as if it'll be there
> forever. name a primary, name a backup, and your agent survives the day a provider
> changes its mind.

---

## bonus: the complete agent

this repo also ships [`src/agent.py`](src/agent.py) — the full version that combines
**all three upgrades at once**: provider fallback (groq → gemini), both tools
(duckduckgo search + your `word_count`), and memory (`InMemorySaver` + `thread_id`).
run it to see the whole thing working end to end:

```bash
python3 src/agent.py
```

---

## where to go from here

you have a working agent now. it reasons, uses tools, remembers, and survives a
provider going down — all free, from your own machine. that's the same core loop the
agents at uber and klarna run on.

where to take it next:

- **build a real tool.** `word_count` was a warm-up. write one that checks your
  calendar, reads a file, or hits an API you actually use. same pattern every time:
  function, docstring, `@tool`, drop it in.
- **add more and let it choose.** give the agent five tools and it picks the right
  ones per request, chaining them when needed. that's the whole point of an agent over
  a chatbot.
- **make memory permanent.** swap `InMemorySaver` for a postgres or redis checkpointer
  so it remembers across restarts, not just one run.
- **when to start paying — if ever.** free tiers are built for what you're doing:
  learning, side projects, low traffic. two signals it's time: real users depend on
  it, or it can't fail during business hours. even then, deepseek runs a dollar or two
  a month. don't pay before you hit one.
- **the real price of free.** most no-key models train on your prompts. keep anything
  private or client-confidential off them; switch to a paid tier or local ollama the
  moment it's sensitive.

no credit card, no course, no degree. just a few free tools and a couple of commands.
what you built today is a foundation. now go point it at something.

---

*~m0h · built for [@exploraX_](https://x.com/exploraX_)*
