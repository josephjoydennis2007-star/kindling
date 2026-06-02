import { aiOnce } from '@/lib/aiClient';
import { runTool, snapshotState, toolsManual, setAgentRunning, type AgentEvent } from '@/lib/agentTools';
import { appendTurns, loadMemory, type MemoryTurn } from '@/lib/agentMemory';
import { useAppStore } from '@/store/useAppStore';

/**
 * agentRunner — the loop. Given a user goal, call the AI to produce a
 * plan of tool calls, execute them with small delays so the UI animates,
 * then call the AI again with the new state until the AI emits `done` or
 * we hit the iteration cap.
 *
 * Memory: the conversation transcript persists per-story across runs via
 * `agentMemory`. The agent reads the prior transcript on every call so
 * "do the next thing you suggested" works, and "change the second scene
 * to be set in Paris" works without restating context.
 *
 * Events:
 *   - `agent:step`  (from agentTools.runTool) — one per action
 *   - `agent:turn`  (from this file)         — one per AI call
 *     { ts, kind: 'plan' | 'reply' | 'error', text }
 */

const SYSTEM_PROMPT = (state: any, history: string) => `
You are KINDLING CO-WORKER — an agentic AI that fully operates a screenwriting + film-production app on behalf of a writer/director.

You don't just chat. You navigate the app and make REAL changes by calling TOOLS.

You have FULL ACCESS — you can create, read, update, delete, and rearrange anything in the app: story metadata, screenplay text, scenes, shots, characters, plot acts/beats, world items, locations, notes, settings, AND Runway-powered shot images / videos when the user has configured a Runway key. The user has explicitly delegated authority to you.

The user will tell you a goal. Break it into a sequence of tool calls. KEEP GOING across many turns — the loop gives you up to 30 turns and you should use as many as you need. Only emit \`done\` when the entire goal is genuinely complete.

**You CAN build an entire movie from a single prompt.** When the user asks for a complete feature-length screenplay (90–120 pages) or a full short film, plan ambitiously:
- Turn 1–2: Title + logline + synopsis + theme + outline points.
- Turn 3–5: Create 4–8 main characters with arcs (want / fear / archetype).
- Turn 6–8: Build the 3-act (or 5-beat / 12-stage) plot board with beats.
- Turn 9–11: Create 20–60 scenes in the Director view (named, with one-line descriptions).
- Turn 12–25: For each scene in order, call \`writeScreenplay\` with the actual Fountain-style dialogue + action — one scene per turn, navigating to writer before each.
- Turn 26–28: Add storyboard shots per major scene; if Runway is configured, call \`generateShotImage\` for a few hero shots.
- Turn 29–30: Locations + production calendar entries + wrap with \`done\`.

If you run out of turns mid-scene-writing, set \`done: false\` and the next turn picks up. The user can re-run with "continue" to extend further.

${toolsManual()}

## How to respond

On EVERY turn, respond with ONE JSON object — nothing else, no prose around it:

{
  "plan": ["Set up story metadata", "Create 6 characters", "Build 3-act plot", "Create 8 scenes", "Add storyboard shots"],
  "currentStep": 0,
  "thought": "one short sentence (≤ 20 words) — what you're about to do",
  "actions": [
    { "tool": "toolName", "args": { ... } },
    ...
  ],
  "done": false
}

About \`plan\` and \`currentStep\`:
- **First turn**: ALWAYS include a \`plan\` — an ordered list of 3–8 plain-English milestone names the user will see (e.g. "Create characters", "Write opening scene", "Plan production locations"). These are the user-facing progress steps for THEIR specific request. NOT generic, but tailored.
- **Subsequent turns**: omit \`plan\` if it hasn't changed (the previous one stays in effect), OR include it again only if you need to RE-PLAN. Update \`currentStep\` to reflect which milestone you're working on this turn (0-indexed).
- If the request is tiny ("set the title"), use a 1-element plan like \`["Set the title"]\`.
- Don't put internal tool names in plan items — use short user-friendly phrases.

CRITICAL RULES — read these every turn:
- **Keep each turn SMALL.** 3–6 actions per turn maximum. The loop gives you 30 turns — use them. Quality + completeness over a single huge plan.
- **Your full JSON response MUST be under 1500 tokens.** If you write more, it gets truncated mid-string and the parser fails — your turn is wasted.
- **Don't put long text in args.** A whole scene's dialogue + action can be 200–400 words in ONE writeScreenplay call, but never write multiple long scenes in one turn. Do one scene per turn.
- Always start a sub-task with a \`navigate\` action so the user SEES what you're doing.
- When a previous tool failed, fix it next turn — don't repeat the same failing args.
- For BIG requests do NOT emit \`done\` until every part is complete. Plan: turn 1 = setup (title/logline/synopsis), turns 2–4 = characters, turns 5–8 = plot board, turns 9+ = scenes + screenplay text. The loop will continue automatically.
- Use \`list*\` or \`getScreenplaySummary\` BEFORE editing/deleting so you reference the real names/ids in the app.

## Prior conversation on this story
${history || '(no prior conversation — this is a fresh start)'}

## Current app state (live)
${JSON.stringify(state, null, 2)}
`;

export interface AgentTurnEvent {
  ts: number;
  kind: 'plan' | 'reply' | 'error';
  text: string;
}

/** Progress against the AI's own milestone plan. Drives the
 *  "Step 2 of 5 — Creating characters" indicator in the panel. */
export interface AgentProgressEvent {
  steps: string[];     // the milestone names the AI defined
  currentStep: number; // 0-indexed
}

interface PlanShape {
  thought?: string;
  actions?: Array<{ tool: string; args?: any }>;
  /** The AI's milestone list for the user's current request. Set on
   *  the first turn; persists until the AI re-emits a new plan. */
  plan?: string[];
  /** Which milestone the AI is currently working on, 0-indexed. */
  currentStep?: number;
  done?: boolean;
}

function emitTurn(ev: AgentTurnEvent) {
  document.dispatchEvent(new CustomEvent('agent:turn', { detail: ev }));
}

function emitProgress(steps: string[], currentStep: number) {
  document.dispatchEvent(new CustomEvent('agent:progress', { detail: { steps, currentStep } }));
}

/** Detect when Pollinations (or any provider) returns an HTML error page
 *  instead of JSON. Cloudflare 524s / 502s / 503s look like
 *  `<!DOCTYPE html><html>...`. We retry once before surfacing. */
function looksLikeHtmlError(text: string): boolean {
  const head = (text || '').trim().slice(0, 200).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || /^<.+>\s*$/s.test(head.slice(0, 50));
}

let cancelRequested = false;
export function cancelAgent(): void { cancelRequested = true; }
function checkCancelled(): boolean { return cancelRequested; }

const MAX_ITERATIONS = 30;
const STEP_DELAY_MS = 140;

export async function runAgent(goal: string, opts: { maxIterations?: number } = {}): Promise<void> {
  cancelRequested = false;
  setAgentRunning(true);

  const max = opts.maxIterations ?? MAX_ITERATIONS;
  const storyId = useAppStore.getState().activeStoryId;
  const settings = useAppStore.getState().settings;

  // Pull persistent memory for THIS story. We render the whole transcript
  // into the system prompt so the agent can answer "what did you just do?"
  // and act on follow-ups.
  const memoryAtStart: MemoryTurn[] = loadMemory(storyId);

  // Persist the user's new goal up front so even if the run is killed
  // mid-loop, the next session sees it.
  appendTurns(storyId, [{ role: 'user', content: `New goal: ${goal}`, ts: Date.now() }]);

  // Local transcript for the in-prompt context — grows as the loop runs
  // and is checkpoint-saved to memory at the end of each turn.
  const history: MemoryTurn[] = [...memoryAtStart, { role: 'user', content: `New goal: ${goal}`, ts: Date.now() }];

  // AI-defined milestone plan + current step. Set on the first turn that
  // returns a plan; persisted across turns by the runner. Drives the
  // "Step N of M — <label>" UI in AgentPanel instead of "turn N/30".
  let milestones: string[] = [];
  let currentStep = 0;

  // Tracks how many parse failures + HTML errors have occurred so we can
  // bail after repeated failure rather than spinning forever.
  let consecutiveParseFails = 0;
  let consecutiveHtmlErrors = 0;

  try {
    for (let iter = 0; iter < max; iter++) {
      if (checkCancelled()) {
        emitTurn({ ts: Date.now(), kind: 'reply', text: 'Stopped by user.' });
        appendTurns(storyId, [{ role: 'assistant', content: 'Stopped by user.', ts: Date.now() }]);
        break;
      }

      const state = snapshotState();
      const historyText = renderHistory(history);
      const system = SYSTEM_PROMPT(state, historyText);

      // The user message sent to the AI is just the goal — full context
      // lives in the system prompt's "Prior conversation" + state blocks.
      const userMsg = `Continue working on the goal. Use as many tools as you need.`;

      // User-facing status — show a clean "Thinking…" if no plan yet, or
      // "Step N of M — <label>" once the AI has emitted milestones.
      const thinkingText = milestones.length
        ? `Step ${currentStep + 1} of ${milestones.length} — ${milestones[currentStep] || 'Working'}`
        : 'Thinking…';
      emitTurn({ ts: Date.now(), kind: 'plan', text: thinkingText });

      const ai = await aiOnce(settings, system, userMsg, { maxTokens: 2400, temperature: 0.4 });
      if (!ai.ok) {
        emitTurn({ ts: Date.now(), kind: 'error', text: ai.error });
        appendTurns(storyId, [{ role: 'assistant', content: `Error: ${ai.error}`, ts: Date.now() }]);
        return;
      }

      // Detect upstream HTML error pages (Cloudflare 524, 502, etc.) —
      // Pollinations occasionally returns these instead of JSON. Retry
      // once with a small backoff, then surface a friendly message.
      if (looksLikeHtmlError(ai.text)) {
        consecutiveHtmlErrors++;
        if (consecutiveHtmlErrors < 2) {
          emitTurn({ ts: Date.now(), kind: 'plan', text: 'Built-in AI returned an error page — retrying…' });
          await new Promise((r) => setTimeout(r, 2500));
          continue;
        }
        emitTurn({
          ts: Date.now(),
          kind: 'error',
          text: 'The built-in AI service is temporarily unavailable. Wait a moment and click Run again, or switch to a different AI provider in Settings → AI.',
        });
        appendTurns(storyId, [{ role: 'assistant', content: 'AI service unavailable.', ts: Date.now() }]);
        return;
      }
      consecutiveHtmlErrors = 0;

      const plan = parseAndRepairPlan(ai.text);
      if (!plan || !plan.actions || !Array.isArray(plan.actions) || plan.actions.length === 0) {
        // Parser couldn't recover anything useful. Show a short status and
        // RETRY rather than bail — past v2 we used to break here which
        // surfaced raw JSON to the user. Now we feed the failure back to
        // the AI with a "respond shorter" reminder.
        const snippet = ai.text.slice(0, 160);
        emitTurn({ ts: Date.now(), kind: 'plan', text: `Response was unparseable — asking the AI to try again with a smaller plan…` });
        history.push({ role: 'assistant', content: snippet, ts: Date.now() });
        history.push({
          role: 'tool',
          content: 'PARSE FAILURE — your last response was not valid JSON (likely truncated). Respond AGAIN with ONE small JSON object: thought + 2–4 actions. Keep all string args short.',
          ts: Date.now(),
        });
        consecutiveParseFails++;
        if (consecutiveParseFails >= 3) {
          emitTurn({ ts: Date.now(), kind: 'error', text: 'AI is not returning parseable plans. Try a smaller request or stop and restart.' });
          appendTurns(storyId, [{ role: 'assistant', content: 'Aborted: repeated parse failures.', ts: Date.now() }]);
          break;
        }
        continue;
      }
      consecutiveParseFails = 0;

      // Update milestone plan from the AI's response. On the first turn
      // we EXPECT a plan; if the AI forgot, synthesize a single-item one
      // so the user still sees a clean progress label instead of
      // technical noise.
      if (Array.isArray(plan.plan) && plan.plan.length > 0) {
        milestones = plan.plan.slice(0, 12).map((s) => String(s || '').slice(0, 80));
      } else if (milestones.length === 0) {
        // Fallback: derive a single milestone from the user's goal so
        // the user-facing step counter has something to show.
        milestones = [goal.length > 60 ? goal.slice(0, 60) + '…' : goal];
      }
      if (typeof plan.currentStep === 'number' && plan.currentStep >= 0 && plan.currentStep < milestones.length) {
        currentStep = plan.currentStep;
      }
      emitProgress(milestones, currentStep);

      if (plan.thought) {
        emitTurn({ ts: Date.now(), kind: 'plan', text: plan.thought });
      }

      // Execute each action with a tiny delay so the UI animates.
      const stepResults: AgentEvent[] = [];
      let sawDone = false;
      for (const a of plan.actions) {
        if (checkCancelled()) break;
        const ev = await runTool(a.tool, a.args || {});
        stepResults.push(ev);
        if (a.tool === 'done' || ev.result?.done) { sawDone = true; }
        await new Promise((r) => setTimeout(r, STEP_DELAY_MS));
      }

      // Build the tool-result summary for this turn.
      const resultSummary = stepResults.map((r) => {
        const dataHint = r.result?.data ? ` data=${JSON.stringify(r.result.data).slice(0, 300)}` : '';
        return `- ${r.tool}: ${r.ok ? 'ok' : 'FAIL'} — ${r.message || ''}${dataHint}`;
      }).join('\n');

      history.push({ role: 'assistant', content: plan.thought ? `${plan.thought}\nActions: ${plan.actions.map((a) => a.tool).join(', ')}` : `Actions: ${plan.actions.map((a) => a.tool).join(', ')}`, ts: Date.now() });
      history.push({ role: 'tool', content: 'Tool results:\n' + resultSummary, ts: Date.now() });

      // Checkpoint to localStorage after each turn so a refresh / crash
      // doesn't lose progress.
      appendTurns(storyId, [
        { role: 'assistant', content: plan.thought || 'Acting', ts: Date.now() },
        { role: 'tool', content: resultSummary, ts: Date.now() },
      ]);

      if (sawDone || plan.done) {
        emitTurn({ ts: Date.now(), kind: 'reply', text: 'Done.' });
        appendTurns(storyId, [{ role: 'assistant', content: 'Done with this goal.', ts: Date.now() }]);
        break;
      }
    }
  } finally {
    setAgentRunning(false);
  }
}

/** Render in-loop history to a string. Cap to the last 24 turns to keep
 *  prompt size reasonable for the small built-in models. */
function renderHistory(turns: MemoryTurn[]): string {
  const recent = turns.slice(-24);
  return recent.map((t) => `[${t.role.toUpperCase()}]\n${t.content}`).join('\n\n');
}

/**
 * parseAndRepairPlan — robust JSON extraction tolerant to TRUNCATION.
 *
 * The built-in Pollinations model frequently emits a valid-shaped JSON
 * object but runs over the max_tokens budget mid-string, leaving
 * unterminated strings + unclosed braces/brackets. JSON.parse rejects
 * those, which used to drop us into the "no actions returned" branch
 * and show the user raw JSON in the log.
 *
 * Strategy:
 *   1. Try clean parse.
 *   2. Strip ```json fences.
 *   3. Slice from first '{' to last '}', try parse.
 *   4. JSON-aware brace counter: walk the string, track string/escape
 *      state, count open vs closed brackets. If we're mid-string, close
 *      it. Then close any unclosed arrays + objects.
 *   5. If step 4 still fails, progressively drop the trailing bytes
 *      (50 char chunks) and re-close until parse succeeds.
 *
 * Returns the parsed object (or null if nothing salvageable). For our
 * loop we accept partial action arrays — if the AI was mid-way through
 * its 5th action when truncation hit, we'll still execute actions 1–4.
 */
export function parseAndRepairPlan(raw: string): PlanShape | null {
  if (!raw) return null;
  const s = raw.trim();

  // 1. Clean parse first.
  try { return JSON.parse(s) as PlanShape; } catch {}

  // 2. Strip ```json fences if present.
  const fence = s.match(/```(?:json)?\s*([\s\S]+?)```/i);
  const candidate1 = fence ? fence[1] : s;
  try { return JSON.parse(candidate1) as PlanShape; } catch {}

  // 3. Slice between first '{' and last '}'.
  const first = candidate1.indexOf('{');
  const last = candidate1.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(candidate1.slice(first, last + 1)) as PlanShape; } catch {}
  }

  // 4. JSON-aware repair: count open structures, close them.
  const body = first >= 0 ? candidate1.slice(first) : candidate1;
  const repaired = closeOpenStructures(body);
  try { return JSON.parse(repaired) as PlanShape; } catch {}

  // 5. Progressively drop the trailing bytes + retry, dropping the
  // unclosed last action so we at least keep the earlier ones.
  let trimmed = repaired;
  for (let i = 0; i < 30; i++) {
    // Drop last 50 chars, then strip dangling ',' or ':' and re-close.
    trimmed = trimmed.slice(0, Math.max(0, trimmed.length - 60));
    if (trimmed.length < 20) break;
    const cleaned = closeOpenStructures(trimmed.replace(/[,:\s]+$/g, ''));
    try { return JSON.parse(cleaned) as PlanShape; } catch {}
  }
  return null;
}

/** Walk the string tracking string/escape state and emit a corrected
 *  copy that closes any unterminated string + open brackets/braces.
 *  Best-effort — assumes the input is mostly-valid JSON that ran out
 *  of room. */
function closeOpenStructures(body: string): string {
  let openCurly = 0;
  let openSquare = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') openCurly++;
    else if (ch === '}') openCurly--;
    else if (ch === '[') openSquare++;
    else if (ch === ']') openSquare--;
  }
  let out = body;
  // Strip an unterminated trailing object/array element
  // (e.g. `, { "tool": "x", "args":`). Trim any trailing comma + colon.
  out = out.replace(/[,:\s]+$/, '');
  if (inStr) out += '"';
  while (openSquare > 0) { out += ']'; openSquare--; }
  while (openCurly > 0) { out += '}'; openCurly--; }
  return out;
}
