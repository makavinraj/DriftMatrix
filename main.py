from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi import Request, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
import requests
import json

# -----------------------------
# Global State
# -----------------------------

conversation_history = []
original_intent = None
iteration_count = 0

# -----------------------------
# App Setup
# -----------------------------

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

class IntentRequest(BaseModel):
    intent: str

# -----------------------------
# Stream from Ollama
# -----------------------------

def stream_llama(prompt):
    response = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "llama3.1:8b",
            "prompt": prompt,
            "stream": True
        },
        stream=True
    )

    for line in response.iter_lines():
        if line:
            data = json.loads(line.decode("utf-8"))
            if "response" in data:
                yield data["response"]

# -----------------------------
# Embedding
# -----------------------------

def get_embedding(text):
    return embedding_model.encode(text)

# -----------------------------
# Routes
# -----------------------------

@app.get("/", response_class=HTMLResponse)
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/generate")
def generate_response(data: IntentRequest):

    global conversation_history
    global original_intent
    global iteration_count

    if original_intent is None:
        original_intent = data.intent

    iteration_count += 1

    prompt = ""
    for turn in conversation_history:
        prompt += f"User: {turn['user']}\n"
        prompt += f"Assistant: {turn['ai']}\n"

    prompt += f"User: {data.intent}\nAssistant:"

    def event_stream():
        full_response = ""

        for chunk in stream_llama(prompt):
            full_response += chunk
            yield chunk

        # ----- Compute Embeddings -----
        output_vec = get_embedding(full_response).reshape(1, -1)
        original_vec = get_embedding(original_intent).reshape(1, -1)

        strict_similarity = cosine_similarity(original_vec, output_vec)[0][0]
        strict_drift = float(round((1 - strict_similarity) * 100, 2))

        if len(conversation_history) > 0:
            previous_vec = get_embedding(conversation_history[-1]["ai"]).reshape(1, -1)
            prog_similarity = cosine_similarity(previous_vec, output_vec)[0][0]
            progressive_drift = float(round((1 - prog_similarity) * 100, 2))
        else:
            progressive_drift = strict_drift

        # ----- Dynamic Weights -----
        n = iteration_count
        strict_weight = max(0.4, 1 - (n * 0.1))
        progressive_weight = 1 - strict_weight

        hybrid_drift = float(round(
            (strict_weight * strict_drift) +
            (progressive_weight * progressive_drift), 2
        ))

        conversation_history.append({
            "user": data.intent,
            "ai": full_response,
            "strict_drift": strict_drift,
            "progressive_drift": progressive_drift,
            "hybrid_drift": hybrid_drift
        })

        yield f"<<STRICT>>{strict_drift}<<PROG>>{progressive_drift}<<HYB>>{hybrid_drift}<<ITER>>{iteration_count}<<SW>>{strict_weight}<<PW>>{progressive_weight}"

    return StreamingResponse(event_stream(), media_type="text/plain")

@app.post("/decision")
def handle_decision(decision: dict):

    global conversation_history
    global original_intent
    global iteration_count

    action = decision.get("action")

    if action == "reject":
        conversation_history.clear()
        iteration_count = 0
        original_intent = None
        return {"status": "reset", "iteration": 0}

    elif action == "realign":
        if len(conversation_history) > 0:
            original_intent = conversation_history[0]["user"]
        return {"status": "realigned"}

    elif action == "accept":
        if len(conversation_history) > 0:
            original_intent = conversation_history[-1]["ai"]
        return {"status": "accepted"}

    return {"status": "unknown"}

@app.post("/reset")
def reset_conversation():
    global conversation_history
    global original_intent
    global iteration_count

    conversation_history.clear()
    original_intent = None
    iteration_count = 0

    return {"status": "reset"}