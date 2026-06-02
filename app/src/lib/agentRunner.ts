import { aiOnce, extractJSON } from '@/lib/aiClient';
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

You have FULL ACCESS — you can create, read, update, delete, and rearrange anything in the app: story metadata, screenplay text, scenes, shots, characters, plot acts/beats, world items, locations, notes, even settings. The user has explicitly delegated authority to you.

The user will tell you a goal. Break it into a sequence of tool calls. KEEP GOING across many turns — the loop gives you up to 30 turns and you should use as many as you need. Only emit \`done\` when the entire goal is genuinely complete.

${toolsManual()}

## How to respond

On EVERY turn, respond with ONE JSON object — nothing else, no prose around it:

{
  "thought": "1–2 sentences explaining what you're about to do",
  "actions": [
    { "tool": "toolName", "args": { ... } },
    ...
  ],
  "done": false
}

Rules
- Always start a fresh sub-task with a \`navigate\` action so the user can SEE your work.
- You can emit up to 15 actions per turn. Use more actions per turn for big requests — don't stop after 3.
- When a previous tool failed, fix it next turn — don't repeat the same failing args.
- For BIG requests (write a whole feature outline, build a full plot board, populate 10 characters, etc.) do NOT emit \`done\` until you've done EVERY part. Use multiple turns.
- If you're not 100% sure what already exists, call a \`list*\` or \`getScreenplaySummary\` tool FIRST so you don't duplicate work.
- For long-form prose (scene description, dialogue, monologue), use \`writeScreenplay\` with multi-line text — write a LOT of content per call.
- The user can see every action live. Make your actions varied and visible — don't stack 15 identical adds.

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

interface PlanShape {
  thought?: string;
  actions?: Array<{ tool: string; args?: any }>;
  done?: boolean;
}

function emitTurn(ev: AgentTurnEvent) {
  document.dispatchEvent(new CustomEvent('agent:turn', { detail: ev }));
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

      emitTurn({ ts: Date.now(), kind: 'plan', text: `Thinking… (turn ${iter + 1}/${max})` });

      const ai = await aiOnce(settings, system, userMsg, { maxTokens: 3500, temperature: 0.45 });
      if (!ai.ok) {
        emitTurn({ ts: Date.now(), kind: 'error', text: ai.error });
        appendTurns(storyId, [{ role: 'assistant', content: `Error: ${ai.error}`, ts: Date.now() }]);
        return;
      }
      const plan = extractJSON<PlanShape>(ai.text) || {};
      if (!plan.actions || !Array.isArray(plan.actions) || plan.actions.length === 0) {
        // No actions returned — surface the AI's text but DO NOT stop;
        // ask it to try again next turn if there's clearly more to do.
        const text = plan.thought || ai.text.slice(0, 400) || 'No actions returned.';
        emitTurn({ ts: Date.now(), kind: 'reply', text });
        appendTurns(storyId, [{ role: 'assistant', content: text, ts: Date.now() }]);
        // Stop if the AI explicitly said done or this is the first turn
        // (avoid infinite no-ops). Otherwise give it one more chance.
        if (plan.done || iter === 0) break;
        continue;
      }

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
