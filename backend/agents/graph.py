"""
LangGraph StateGraph — wires all agents into the multi-agent loop.

Topology:
  START → strategist → designer → engineer → analyst → optimizer
                           ↑                                │
                           └── loop (score<70, iter<max) ───┤
                                                            │ score≥70 OR iter≥max
                                                            ▼
                                                      human_gate (interrupt)
                                                       /    |    \\
                                                  approve revise  reject
                                                     │      │       │
                                                 publisher designer  END
                                                     │
                                                    END
"""
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver

from backend.agents.state import VideoProductionState
from backend.agents.strategist import run_strategist
from backend.agents.designer import run_designer
from backend.agents.engineer import run_engineer
from backend.agents.analyst import run_analyst
from backend.agents.optimizer import run_optimizer
from backend.agents.human_gate import human_gate_node
from backend.agents.publisher import publisher_node
from backend.app.config import CHECKPOINTS_DB, ENGAGEMENT_THRESHOLD


def score_router(state: VideoProductionState) -> str:
    """Route after Optimizer: loop back to Designer or forward to human gate."""
    score = state.get("engagement_score", 0)
    iteration = state.get("iteration_count", 0)
    max_iter = state.get("max_iterations", 3)

    if score >= ENGAGEMENT_THRESHOLD or iteration >= max_iter:
        return "to_human"
    return "loop"


def decision_router(state: VideoProductionState) -> str:
    """Route after human gate based on the human's decision."""
    return state.get("human_decision", "reject")


def build_graph() -> tuple:
    """Build and compile the StateGraph. Returns (compiled_graph, checkpointer)."""
    graph = StateGraph(VideoProductionState)

    graph.add_node("strategist", run_strategist)
    graph.add_node("designer", run_designer)
    graph.add_node("engineer", run_engineer)
    graph.add_node("analyst", run_analyst)
    graph.add_node("optimizer", run_optimizer)
    graph.add_node("human_gate", human_gate_node)
    graph.add_node("publisher", publisher_node)

    graph.add_edge(START, "strategist")
    graph.add_edge("strategist", "designer")
    graph.add_edge("designer", "engineer")
    graph.add_edge("engineer", "analyst")
    graph.add_edge("analyst", "optimizer")

    graph.add_conditional_edges(
        "optimizer",
        score_router,
        {"to_human": "human_gate", "loop": "designer"},
    )

    graph.add_conditional_edges(
        "human_gate",
        decision_router,
        {"approve": "publisher", "revise": "designer", "reject": END},
    )

    graph.add_edge("publisher", END)

    checkpointer = SqliteSaver.from_conn_string(CHECKPOINTS_DB)
    compiled = graph.compile(checkpointer=checkpointer, interrupt_before=["human_gate"])

    return compiled, checkpointer


# Module-level singleton — imported by main.py
compiled_graph, _checkpointer = build_graph()
