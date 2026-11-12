"""Single source of truth for request limits shared by the schema, planner and workflow."""

MAX_QUESTIONS = 100          # tasks per request (was 20)
PLAN_CHUNK = 20              # questions planned per LLM call; larger batches are planned chunk by chunk
MAX_QUESTION_CHARS = 4000
MAX_TOTAL_CHARS = 40000
