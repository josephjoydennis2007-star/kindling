import { aiOnce, extractJSON } from '@/lib/aiClient';
import { runTool, snapshotState, toolsManual, setAgentRunning, type AgentEvent } from '@/lib/agentTools';
import { useAppStore } from '@/store/useAppStore';

/**
 * agentRunner — the loop. Given a user goal, call the AI to produce a
 * plan of tool calls, execute them one at a time with small delays so the
 * UI animates, then call the AI again with the new state until the AI
 * emits `done` or we hit the iteration cap.
 *
 * The loop emits two DOM events:
 *   - `agent:step`  (from agentTools.runTool) — one per action
 *   - `agent:turn`  (from this file)         — one per AI call
 *     { ts, kind: 'plan'|'reply'|'error', text }
 *
 * AgentPanel.tsx subscribes to both.
 */

const SYSTEM_PROMPT = (state: any) => `
You are KINDLING CO-WORKER — an agentic AI that operates a screenwriting + film-production app on behalf of a writer/director.
You don't just chat. You navigate the app and make actual changes by calling TOOLS.

The user will tell you a goal. You break it into a sequence of tool calls.

${toolsManual()}

## How to respond

On EVERY turn, respond with a single JSON object — nothing else, no prose around it:

{
  "thought": "1–2 sentences explaining what you're about to do",
  "actions": [
    { "tool": "toolName", "args": { ... } },
    ...
  ],
  "done": false
}

- Always start with a \`navigate\` action to the relevant tab so the user can SEE your work.
- Keep each turn small (3–10 actions) so the live log stays readable. If the goal is big, you'll be called again with updated state.
- When the user's goal is complete, set "done": true AND append a \`done\` action with a summary as the LAST action.
- If a previous tool call failed, fix it in this turn — don't repeat the same failing args.

## Current app state
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

const MAX_ITERATIONS = 8;
const STEP_DELAY_MS = 180;  // small delay between actions so the user can see each one happen

export async function runAgent(goal: string, opts: { maxIterations?: number } = {}): Promise<void> {
  cancelRequested = false;
  setAgentRunning(true);

  const max = opts.maxIterations ?? MAX_ITERATIONS;
  const settings = useAppStore.getState().settings;

  // The "transcript" we feed back to the AI on each turn. Goal stays
  // pinned, action history grows.
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: `Goal: ${goal}` },
  ];

  try {
    for (let iter = 0; iter < max; iter++) {
      if (checkCancelled()) {
        emitTurn({ ts: Date.now(), kind: 'reply', text: 'Stopped by user.' });
        break;
      }

      const state = snapshotState();
      const system = SYSTEM_PROMPT(state);
      const user = history.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');

      emitTurn({ ts: Date.now(), kind: 'plan', text: `Thinking… (turn ${iter + 1}/${max})` });

      const ai = await aiOnce(settings, system, user, { maxTokens: 1500, temperature: 0.4 });
      if (!ai.ok) {
        emitTurn({ ts: Date.now(), kind: 'error', text: ai.error });
        return;
      }
      const plan = extractJSON<PlanShape>(ai.text) || {};
      if (!plan.actions || !Array.isArray(plan.actions) || plan.actions.length === 0) {
        emitTurn({
          ts: Date.now(),
          kind: 'reply',
          text: plan.thought || ai.text.slice(0, 400) || 'No actions returned.',
        });
        break;
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

      // Append a synthetic assistant turn + tool-result turn so the AI
      // can see what happened next round.
      history.push({ role: 'assistant', content: ai.text });
      history.push({
        role: 'user',
        content: 'Tool results:\n' + stepResults.map((r) =>
          `- ${r.tool}: ${r.ok ? 'ok' : 'FAIL'} — ${r.message || ''}`).join('\n'),
      });

      if (sawDone || plan.done) {
        emitTurn({ ts: Date.now(), kind: 'reply', text: 'Done.' });
        break;
      }
    }
  } finally {
    setAgentRunning(false);
  }
}
