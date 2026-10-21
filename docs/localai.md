# Local AI Setup for Navigator-AI
## Plan: Local Ollama model for navigator-ai (Option A)

**Key finding:** navigator-ai already has a pluggable LLM layer (`providerFactory.ts`, `openAiClient.ts`). `OpenAiClient` calls `${OPENAI_BASE_URL}/chat/completions`, and Ollama serves that same OpenAI-compatible endpoint at `http://<host>:11434/v1`. So the change is mostly configuration plus a few small code tweaks. I haven't implemented anything yet.

### Phase 1 – Provision Ollama on the VPS (ops, no code)
1. SSH in, run `curl -fsSL https://ollama.com/install.sh | sh`, then `systemctl enable --now ollama`.
2. Download `Llama-3.2-3B-Instruct-Q4_K_M.gguf` (or Qwen2.5-3B/7B-Instruct, which usually follows JSON instructions better) into `/root/models`.
3. Create the `Modelfile`, and add `PARAMETER temperature 0`, `PARAMETER num_ctx 4096` and `PARAMETER num_thread <physical cores>`. Then run `ollama create navigator-llm -f Modelfile`.
4. Smoke test: `curl localhost:11434/v1/chat/completions -d '{"model":"navigator-llm","messages":[{"role":"user","content":"ok"}]}'`.
5. **Security:** Ollama has no authentication. Keep it bound to `127.0.0.1` (the default), or to the Docker bridge only, and firewall port 11434. Do not use the `0.0.0.0` exposure from the outline.
6. Keep `htop` open for the first test and watch swap. `OLLAMA_KEEP_ALIVE=-1` keeps the model resident and avoids cold-start latency.

### Phase 1 Walkthrough

## Phase 1 walkthrough: Ollama on the VPS

Run these on the VPS as root, or with `sudo`. I haven't run any of them for you.

### 1. Check the machine first
```bash
nproc                 # vCPU count (use this to set num_thread later)
free -h               # RAM and swap
df -h /               # a 3B Q4 model needs ~2 GB, a 7B Q4 needs ~4.5 GB
lscpu | grep -i -E "model name|flags" | grep -o -E "model name.*|avx2|avx512[a-z_]*" | sort -u
```
AVX2 should be present. It matters a lot for CPU speed.

### 2. Install and enable Ollama
```bash
curl -fsSL https://ollama.com/install.sh | sh
systemctl enable --now ollama
systemctl status ollama --no-pager
curl http://127.0.0.1:11434/        # expect "Ollama is running"
```

### 3. Set the service options
```bash
systemctl edit ollama
```
Paste this in the editor and save:
```ini
[Service]
Environment="OLLAMA_HOST=127.0.0.1:11434"
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
```
Then apply it with `systemctl restart ollama`.

- **Bind address:** `127.0.0.1` keeps the unauthenticated API off the internet.
- **Keep-alive:** `-1` keeps the model in RAM, so there is no cold-start delay.
- **Parallelism:** one request at a time is what a CPU box can sustain.
- **Docker:** if navigator-ai runs in Docker on this same VPS, it can't reach `127.0.0.1` on the host. Bind to the Docker bridge IP instead (usually `172.17.0.1:11434`), and make sure the firewall blocks 11434 from outside. I'll handle this in Phase 3.


**Start with Qwen2.5 3B, then benchmark 7B.** Your VPS has 4 vCPU, 7.8 GB RAM, no swap and no GPU.

| | 3B Q4_K_M | 7B Q4_K_M |
|---|---|---|
| Model size | ~1.9 GB | ~4.7 GB |
| RAM with 4k context | ~2.5–3 GB | ~5.5–6 GB |
| Speed (4 vCPU, AVX2) | ~6–12 tok/s | ~2–4 tok/s |
| JSON reliability | decent | noticeably better |

- **Memory:** your 5.1 GB "available" is the real limit. The 7B model would fit only barely, with no swap. A spike could get the OOM killer to terminate Ollama or something else, including your other services.
- **Speed:** navigator-ai prompts include hypermedia and history context. Prompt processing plus a ~200-token JSON answer could take 60+ seconds on 7B, versus about 15–25 seconds on 3B.
- **Cheap fallback:** the Zod validation, retry and clarification design from Phase 2 keeps 3B's occasional JSON slips safe.

**Optional safety net:** add a swap file. It protects against OOM, but it's not meant to be used for inference.
```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### Next steps
```bash
ollama pull qwen2.5:3b-instruct-q4_K_M
```
Use the Ollama registry pull here. It's simpler than the GGUF and Modelfile route, and it's equivalent. Then create the tuned alias:
```bash
mkdir -p /root/models && cd /root/models
printf 'FROM qwen2.5:3b-instruct-q4_K_M\nPARAMETER temperature 0\nPARAMETER num_ctx 4096\nPARAMETER num_thread 4\n' > Modelfile
ollama create navigator-llm -f Modelfile
```
Then run the step 6 smoke test, and `ollama run navigator-llm --verbose "Explain a purchase order in 3 sentences."` for the tokens/s figure.

**Check before continuing:** your paste shows `systemctl edit ollama` garbled into the previous command output, so the override may not have been saved. Verify it:
```bash
systemctl cat ollama | grep -A6 override
ss -ltnp | grep 11434
```
You want to see `OLLAMA_KEEP_ALIVE=-1`, `OLLAMA_NUM_PARALLEL=1` and `127.0.0.1:11434`. The `127.0.0.1` binding is the default, so you're safe either way. If the override is missing, re-run `systemctl edit ollama` and paste the block from my earlier message.

**Trying 7B later:** pull `qwen2.5:7b-instruct-q4_K_M` and test it with the same 3 or 4 real navigator prompts. Move up only if 3B's JSON validity is poor and 7B's latency is acceptable. Send me the `eval rate` figure and I'll set the timeout and defaults from it.
### 4. Get the model
**Simplest route:** let Ollama download it.
```bash
ollama pull llama3.2:3b-instruct-q4_K_M
```
**GGUF route**, which matches your outline:
```bash
mkdir -p /root/models && cd /root/models
curl -L -O https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf
ls -lh                      # check that the size is about 2 GB
```
Alternatively, `ollama pull qwen2.5:7b-instruct-q4_K_M` is a stronger JSON follower if you have 12 GB of RAM.

### 5. Create the tuned model
```bash
cd /root/models
cat > Modelfile <<'EOF'
FROM ./Llama-3.2-3B-Instruct-Q4_K_M.gguf
PARAMETER temperature 0
PARAMETER num_ctx 4096
PARAMETER num_thread 4
EOF
ollama create navigator-llm -f Modelfile
ollama list
```
Set `num_thread` to your physical core count, which is often half of `nproc` if the vCPUs are hyperthreads. If you used `ollama pull` in step 4, replace the `FROM` line with `FROM llama3.2:3b-instruct-q4_K_M`.

### 6. Smoke test, using the OpenAI-compatible endpoint navigator-ai will call
```bash
time curl -s http://127.0.0.1:11434/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"navigator-llm","temperature":0,"messages":[
        {"role":"system","content":"Reply with JSON only."},
        {"role":"user","content":"Return {\"status\":\"ok\"}"}]}'
```
You should get a `choices[0].message.content` containing the JSON. The first call is slower because the model has to load. Run it again to see the warm latency.

Then check the speed, with `htop` open in a second SSH window:
```bash
ollama run navigator-llm --verbose "Explain a purchase order in 3 sentences."
```
Note the `eval rate` (tokens/s). Expect roughly 5–15 tok/s for a 3B model on 4 vCPU. Also confirm swap stays near zero with `free -h`.

### 7. Lock down the network
```bash
ss -ltnp | grep 11434          # must show 127.0.0.1 (or the bridge IP), never 0.0.0.0
ufw status                      # if ufw is in use: ufw deny 11434
```

### Phase 1 exit checklist
- [ ] `systemctl is-active ollama` returns `active`
- [ ] `navigator-llm` appears in `ollama list`
- [ ] The `/v1/chat/completions` call returns valid JSON
- [ ] Warm tokens/s is recorded
- [ ] Swap use is about 0 during inference
- [ ] Port 11434 is not publicly reachable

Send me the output of steps 1 and 6, including `nproc`, RAM and tokens/s. I'll use them to pick `num_thread`, the timeout value and the default model for Phase 2.

### Phase 2 – Code changes in navigator-ai (small)
1. **Add an `ollama` provider** to `LlmProvider` in `env.ts` and the factory. This is better than reusing `openai`, because that provider requires `OPENAI_API_KEY` and sends `max_completion_tokens`. New env vars: `OLLAMA_BASE_URL` (default `http://host.docker.internal:11434/v1`), `OLLAMA_MODEL`, `OLLAMA_MAX_TOKENS`, `OLLAMA_TIMEOUT_MS`.
2. **Add `OllamaClient`**. It will reuse the `OpenAiClient` request and trace logic (a refactor into a shared base is likely cleaner), with these differences:
   - no auth header
   - `max_tokens` and `temperature: 0`
   - `AbortSignal.timeout`, since CPU inference is slow (30–120 s for long prompts)
   - an optional `response_format: {type:"json_object"}` for the extraction flows
   - `provider` becomes `"ollama"` in `types.ts`
3. **`validateConnectivity`** should hit `GET /api/tags` (cheap) and confirm the model exists. Do not do a full chat call, because that makes readiness checks slow on CPU.
4. **Prompt hardening.** Small models are less reliable at strict JSON. Reuse the Phase 2 plan in `roadmapNavigatorAI2.md`: Zod validation on every LLM output, one retry with the validation error fed back, then fall back to the clarification-needed flow. The LLM stays advisory and the constitutional/governance gates stay authoritative.
5. **Fallback.** Add optional `LLM_FALLBACK_PROVIDER=deterministic`, so a timeout degrades gracefully instead of returning a 502.

### Phase 3 – Deployment config
- Update `.env.example` and `docker-compose.yml`. Set `LLM_PROVIDER=ollama` and `OLLAMA_BASE_URL` for the `navigator-ai` service. Add `extra_hosts: host.docker.internal:host-gateway` if Ollama runs on the host. Alternatively, add an `ollama` compose service with a volume and no published port.
- Update the Navigator docs and README with setup steps.

### Phase 4 – Tests and verification
- Unit tests for `OllamaClient` using a mocked `fetch` (success, non-200, timeout, empty response). Run them with `npm test` in the service.
- A provider-factory test for `LLM_PROVIDER=ollama`, and an env validation test.
- Manual end-to-end run on the VPS with `LLM_PROVIDER=ollama`. Hit the `/health` endpoint, then the decide, explain and prompt-create routes, and record latency and tokens/s.
- Compare outputs against the `deterministic` provider on the existing Postman collection.

### Phase 5 – Tuning and rollout
- Benchmark Q4_K_M against Q5_K_M and 3B against 7B, checking JSON validity rate and latency. On 8–12 GB RAM, a 3B–7B Q4 model fits, but keep context at 4096 or lower.
- Match `num_thread` to physical cores, and limit concurrency to one in-flight request with a simple queue so CPU requests don't pile up.
- Roll out behind the env flag, with the existing provider as a one-line rollback.

### Risks
| Risk | Mitigation |
|---|---|
| Slow CPU inference | Timeout, keep-alive, small context, fallback provider |
| Malformed JSON from a small model | Zod validation, retry, clarification flow |
| Unauthenticated Ollama port | Localhost or private network only, firewall |
| RAM exhaustion and swap | 3B Q4 first, monitor with `htop`, cap context |

Want me to go ahead with Phases 2–4 (the code, config, and tests)?
Ran terminal command: cd /root/projects/constitutional-erp/services/navigator-ai; cat src/config/env.ts | sed -n 15,125p; cat src/llm/trace.ts | head -20; grep -rn "validateConnectivity\|\.provider\|llmProvider" src --include=*.ts | grep -v "^src/llm/"; ls test; cat src/llm/deterministicClient.ts | head -30

Ran terminal command: cd /root/projects/constitutional-erp/services/navigator-ai && python3 - <<'EOF'
import re
p='src/config/env.ts'; s=open(p).read()
s=s.replace('"azure" | "openai" | "deterministic";','"azure" | "openai" | "ollama" | "deterministic";',1)
s=s.replace("  openAiMaxTokens: number;\n","  openAiMaxTokens: number;\n  ollamaBaseUrl: string;\n  ollamaModel: string;\n  ollamaMaxTokens: number;\n  ollamaTimeoutMs: number;\n",1)
s=s.replace('value === "openai" || value','value === "openai" || value === "ollama" || value',1)
s=s.replace("azure, openai, deterministic","azure, openai, ollama, deterministic")
s=s.replace("    deterministicSeed:","""    ollamaBaseUrl: (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\\/+$/, ""),
    ollamaModel: process.env.OLLAMA_MODEL ?? "navigator-llm",
    ollamaMaxTokens: Number(process.env.OLLAMA_MAX_TOKENS ?? 512),
    ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS ?? 180000),
    deterministicSeed:""",1)
open(p,'w').write(s)
p='src/llm/types.ts'; s=open(p).read()
s=s.replace('"azure" | "openai" | "deterministic"','"azure" | "openai" | "ollama" | "deterministic"'); open(p,'w').write(s)
p='src/llm/providerFactory.ts'; s=open(p).read()
s=s.replace('import { OpenAiClient','import { OllamaClient } from "./ollamaClient";\nimport { OpenAiClient')
s=s.replace('    case "azure":','    case "ollama":\n      return new OllamaClient(config);\n    case "azure":'); open(p,'w').write(s)
p='.env.example'; s=open(p).read()
s=s.replace("OPENAI_MAX_TOKENS=4096\n","""OPENAI_MAX_TOKENS=4096

# Local model via Ollama (LLM_PROVIDER=ollama). Keep Ollama bound to localhost/private network.
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODEL=navigator-llm
OLLAMA_MAX_TOKENS=512
OLLAMA_TIMEOUT_MS=180000
""",1); open(p,'w').write(s)
EOF
cat > src/llm/ollamaClient.ts <<'EOF'
import { createHash, randomUUID } from "node:crypto";
import { AppConfig } from "../config/env";
import { recordLlmInteraction } from "../domain/stores/navigatorStore";
import { HttpError } from "../utils/errors";
import { LlmClient, LlmMessage } from "./types";
import { maybeTraceLlm } from "./trace";

const MAX_QUEUED = 4;

function hashContext(messages: LlmMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}

export class OllamaClient implements LlmClient {
  readonly provider = "ollama" as const;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(private readonly config: AppConfig) {}

  get model(): string {
    return this.config.ollamaModel;
  }

  // Ollama's native API lives beside the /v1 OpenAI-compatible path.
  private get nativeBaseUrl(): string {
    return this.config.ollamaBaseUrl.replace(/\/v1$/, "");
  }

  async validateConnectivity(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.nativeBaseUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
    } catch (error) {
      throw new HttpError(502, "llm_unavailable", `Ollama unreachable: ${(error as Error).message}`);
    }
    if (!response.ok) {
      throw new HttpError(502, "llm_unavailable", `Ollama health check failed: ${response.status}`);
    }
    const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const wanted = this.model.includes(":") ? this.model : `${this.model}:latest`;
    const found = (body.models ?? []).some((m) => (m.name ?? m.model) === wanted);
    if (!found) {
      throw new HttpError(502, "llm_unavailable", `Ollama model not found: ${this.model}`);
    }
  }

  // CPU inference handles one request at a time; excess requests wait, then are rejected when the queue is full.
  async chat(messages: LlmMessage[]): Promise<string> {
    if (this.pending >= MAX_QUEUED) {
      throw new HttpError(503, "llm_busy", "Local model is busy; try again shortly");
    }
    this.pending += 1;
    const run = this.tail.then(() => this.execute(messages));
    this.tail = run.catch(() => undefined);
    try {
      return await run;
    } finally {
      this.pending -= 1;
    }
  }

  private async execute(messages: LlmMessage[]): Promise<string> {
    const url = `${this.config.ollamaBaseUrl}/chat/completions`;
    const payload = {
      model: this.model,
      messages,
      temperature: 0,
      max_tokens: this.config.ollamaMaxTokens
    };

    maybeTraceLlm(this.config, "request", { provider: this.provider, model: this.model, url, payload });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.ollamaTimeoutMs)
      });
    } catch (error) {
      const message = (error as Error).message;
      maybeTraceLlm(this.config, "error", { provider: this.provider, model: this.model, error: message });
      throw new HttpError(502, "llm_unavailable", `Ollama call failed: ${message}`);
    }

    if (!response.ok) {
      const text = await response.text();
      maybeTraceLlm(this.config, "error", {
        provider: this.provider,
        model: this.model,
        status: response.status,
        error: text
      });
      throw new HttpError(502, "llm_unavailable", `Ollama call failed: ${text}`);
    }

    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    maybeTraceLlm(this.config, "response", { provider: this.provider, model: this.model, body });

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new HttpError(502, "llm_invalid_response", "Ollama returned an empty response");
    }

    recordLlmInteraction({
      id: randomUUID(),
      kind: "chat",
      model: `${this.provider}:${this.model}`,
      promptJson: JSON.stringify(payload),
      responseText: content,
      contextHash: hashContext(messages)
    });

    return content;
  }
}
EOF
cat > test/ollamaClient.test.ts <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/env";
import { OllamaClient } from "../src/llm/ollamaClient";
import { createLlmClient } from "../src/llm/providerFactory";

process.env.LLM_PROVIDER = "ollama";
process.env.DATABASE_PATH = ":memory:";

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("factory returns OllamaClient with defaults", () => {
  const config = loadConfig();
  const client = createLlmClient(config);
  assert.ok(client instanceof OllamaClient);
  assert.equal(client.model, "navigator-llm");
});

test("validateConnectivity checks /api/tags for the model", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ models: [{ name: "navigator-llm:latest" }] }));
  }) as typeof fetch;
  await new OllamaClient(loadConfig()).validateConnectivity();
  assert.equal(urls[0], "http://127.0.0.1:11434/api/tags");
});

test("validateConnectivity fails when model missing", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ models: [] }))) as typeof fetch;
  await assert.rejects(() => new OllamaClient(loadConfig()).validateConnectivity(), /not found/);
});

test("chat surfaces upstream errors", async () => {
  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
  await assert.rejects(() => new OllamaClient(loadConfig()).chat([{ role: "user", content: "hi" }]), /Ollama call failed/);
});

test("chat rejects when queue is full", async () => {
  globalThis.fetch = (() => new Promise(() => undefined)) as typeof fetch;
  const client = new OllamaClient(loadConfig());
  for (let i = 0; i < 4; i += 1) void client.chat([{ role: "user", content: "x" }]).catch(() => undefined);
  await assert.rejects(() => client.chat([{ role: "user", content: "y" }]), /busy/);
});
EOF
npm run lint 2>&1 | tail -15; npx tsx --test test/ollamaClient.test.ts 2>&1 | tail -30

Ran terminal command: cd /root/projects/constitutional-erp/services/navigator-ai && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"; git status --short

Ran terminal command: cd /root/projects/constitutional-erp/services/navigator-ai && npm test 2>&1 | grep -E "^not ok|✖" | head; git stash -q; npm test 2>&1 | grep -E "^ℹ (pass|fail)"; git stash pop -q

Phase 2 is implemented. The new tests pass and the type-check is clean. In the full `npm test` run, 27 of 28 tests pass. The one failure is `promptCreate purchase-order intent requires missing IDs…`, and it also fails with my changes stashed, so it isn't caused by this work.

I haven't tested against your real Ollama instance yet.

**Changes in `services/navigator-ai`**
- **Config:** `env.ts` now accepts `LLM_PROVIDER=ollama`. It reads these new variables:
  - `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434/v1`)
  - `OLLAMA_MODEL` (default `navigator-llm`)
  - `OLLAMA_MAX_TOKENS` (default 512)
  - `OLLAMA_TIMEOUT_MS` (default 180000)
- **Provider wiring:** the new provider type is added in `types.ts` and `providerFactory.ts`.
- **New client:** `ollamaClient.ts` calls `/chat/completions` with no auth header and `temperature: 0`, and it is timed out by `OLLAMA_TIMEOUT_MS`.
  - **Queueing:** requests run one at a time. If 4 are already waiting, the next one gets a 503 `llm_busy`.
  - **Health check:** startup checks `GET /api/tags` for the model instead of making a chat call.
  - **Logging:** interactions are recorded and traced the same way as the OpenAI client.
- **Env example:** `.env.example` lists the new variables.
- **Tests:** `ollamaClient.test.ts` covers the factory, the health check (model present and missing), an upstream error, and the full queue. It doesn't cover a successful chat call, because that needs the database.

**Not done yet:** Zod validation with a retry on LLM output, the optional `deterministic` fallback, and the docker-compose and docs changes (Phase 3).

**Try it on the VPS (from the navigator-ai folder):**
```bash
LLM_PROVIDER=ollama npm run dev
curl localhost:4016/health   # may need your API key header
```
If navigator-ai runs on a different machine from Ollama, you'll need `OLLAMA_BASE_URL` pointing at a private address. Don't expose port 11434 publicly.

Shall I move on to Phase 3 (compose and docs) and the output-validation retry?

## Comparing a second model: Qwen2.5 3B

Goal: run Qwen2.5 3B Instruct alongside the current `navigator-llm` and compare them on the same prompts. Both aliases can exist at once. With `OLLAMA_MAX_LOADED_MODELS=1`, Ollama unloads one model when you call the other, so there is no RAM problem. Each switch costs a cold load of about 5–15 s.

### 1. Check the current model and disk space
```bash
ollama list
ollama show navigator-llm --modelfile | head -5   # shows the FROM line, i.e. which base model it uses
df -h /
```
A 3B Q4_K_M model needs about 2 GB of disk.

### 2. Pull the model
```bash
ollama pull qwen2.5:3b-instruct-q4_K_M
```

### 3. Create the tuned alias with the same parameters as `navigator-llm`
```bash
cd /root/models
printf 'FROM qwen2.5:3b-instruct-q4_K_M\nPARAMETER temperature 0\nPARAMETER num_ctx 4096\nPARAMETER num_thread 4\n' > Modelfile.qwen
ollama create navigator-llm-qwen -f Modelfile.qwen
ollama list
```
Keep `temperature`, `num_ctx` and `num_thread` identical to the current Modelfile, or the comparison isn't fair.

### 4. Smoke test
```bash
time curl -s http://127.0.0.1:11434/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"navigator-llm-qwen","temperature":0,"messages":[
        {"role":"system","content":"Reply with JSON only."},
        {"role":"user","content":"Return {\"status\":\"ok\"}"}]}'
```

### 5. Benchmark both models on the same prompts
Use 3–4 real navigator prompts. Include one that requires strict JSON.
```bash
for m in navigator-llm navigator-llm-qwen; do
  echo "=== $m ==="
  ollama run $m --verbose "Explain a purchase order in 3 sentences." 2>&1 | grep -E "load duration|prompt eval rate|eval rate|total duration"
done
```
Run each model twice and record the second run (warm). Watch `free -h` for swap.

### 6. Compare JSON validity
```bash
PROMPT='Return ONLY JSON: {"intent":"create_purchase_order","missing":["supplierId"]}'
for m in navigator-llm navigator-llm-qwen; do
  for i in 1 2 3 4 5; do
    curl -s http://127.0.0.1:11434/v1/chat/completions -H 'content-type: application/json' \
      -d "{\"model\":\"$m\",\"temperature\":0,\"messages\":[{\"role\":\"user\",\"content\":$(printf '%s' "$PROMPT" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')}]}" \
    | python3 -c 'import json,sys; c=json.load(sys.stdin)["choices"][0]["message"]["content"]; json.loads(c); print("valid")' 2>/dev/null || echo "INVALID"
  done | sort | uniq -c | sed "s/^/$m /"
done
```

Record the results:

| Model | Warm eval rate (tok/s) | Total time for a navigator prompt | Valid JSON (n/5) | Follows the schema | Peak RAM |
|---|---|---|---|---|---|
| navigator-llm | | | | | |
| navigator-llm-qwen | | | | | |

### 7. Test through navigator-ai
Switch the model with an env var and no code change:
```bash
OLLAMA_MODEL=navigator-llm-qwen LLM_PROVIDER=ollama npm run dev   # from services/navigator-ai
```
The startup health check (`GET /api/tags`) confirms the model exists. Run the same navigator requests against each model. Compare the Zod validation failures and retries in the logs, plus the end-to-end latency.

### 8. Choose and clean up
- Pick the model with valid JSON and acceptable latency. If they're close, prefer the faster one.
- Set the winner in `.env` as `OLLAMA_MODEL=...`.
- Remove the loser to free disk space:
```bash
ollama rm <loser-alias>
ollama rm <base-model-tag>    # only if no other alias uses it
```