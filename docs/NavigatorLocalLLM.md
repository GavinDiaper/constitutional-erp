# Navigator AI – Local LLM (Ollama)

navigator-ai can use a local quantized model served by Ollama instead of Azure/OpenAI.
Reference setup: 4 vCPU / 8 GB VPS, `qwen2.5:3b-instruct-q4_K_M` (~10 tok/s generation, ~22 tok/s prompt).

## 1. Ollama on the host
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:3b-instruct-q4_K_M
printf 'FROM qwen2.5:3b-instruct-q4_K_M\nPARAMETER temperature 0\nPARAMETER num_ctx 4096\nPARAMETER num_thread 4\n' > Modelfile
ollama create navigator-llm -f Modelfile
```
`systemctl edit ollama`:
```ini
[Service]
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
```

## 2. Network and security
Ollama has no authentication. Never expose port 11434 publicly.
- navigator-ai running directly on the host: keep the default `OLLAMA_HOST=127.0.0.1:11434`.
- navigator-ai in Docker (compose): the container reaches the host via `host.docker.internal`
  (mapped to the Docker gateway). Add `Environment="OLLAMA_HOST=0.0.0.0:11434"` to the Ollama override
  **and** block external access, e.g. `ufw deny in on eth0 to any port 11434`
  (check the public interface name with `ip route`), then verify with `ss -ltnp | grep 11434` and a port scan from outside.

## 3. Configure navigator-ai
| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` (compose: `NAVIGATOR_LLM_PROVIDER`) | `deterministic` | set to `ollama` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` (compose: `http://host.docker.internal:11434/v1`) | |
| `OLLAMA_MODEL` | `navigator-llm` | must exist in `ollama list` |
| `OLLAMA_MAX_TOKENS` | `512` | |
| `OLLAMA_TIMEOUT_MS` | `180000` | CPU prompt processing is slow |

Compose example:
```bash
NAVIGATOR_LLM_PROVIDER=ollama docker compose -f infra/compose/docker-compose.yml up -d navigator-ai
```
Startup validates connectivity through `GET /api/tags`; the service fails fast if Ollama or the model is missing.
Requests are processed one at a time; when 4 are already queued, further calls return `503 llm_busy`.

## 4. Verify
```bash
curl -s http://127.0.0.1:11434/v1/chat/completions -H 'content-type: application/json' \
  -d '{"model":"navigator-llm","messages":[{"role":"user","content":"Return ok"}]}'
curl -s localhost:4016/health
```
Roll back by setting `LLM_PROVIDER` to the previous provider.
