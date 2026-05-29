import { test, expect } from '@playwright/test';

/**
 * Kindling smoke test.
 *
 * Single end-to-end happy path that exercises the three things most likely
 * to silently break on a future session:
 *
 *   1. The app shell mounts without throwing (catches the AnimatePresence /
 *      Zustand-persist class of white-screen regressions).
 *   2. StorySelector creates a new story and routes into the writer.
 *   3. Ctrl/Cmd+S triggers the save → StatusBar reflects "Saved".
 *
 * Hermetic: bypasses Firebase by injecting `kindling-auth-skipped` and
 * `kindling-onboarded-v1` into localStorage BEFORE the first navigation, so
 * no real credentials are needed and the test works in CI from a clean
 * browser context.
 *
 * Prereqs (run once):
 *   npm install               # @playwright/test is already in devDependencies
 *   npx playwright install chromium
 *
 * Run:
 *   npm run test:e2e          # headless
 *   npm run test:e2e:ui       # Playwright's interactive UI
 */

const SKIP_AUTH = 'kindling-auth-skipped';
const ONBOARDED = 'kindling-onboarded-v1';

test.beforeEach(async ({ context }) => {
  // addInitScript runs BEFORE any page script on every navigation in this
  // context — the only reliable way to skip the auth wall + onboarding
  // modal on first paint.
  await context.addInitScript(
    ({ skipKey, onboardKey }) => {
      try {
        localStorage.setItem(skipKey, '1');
        localStorage.setItem(onboardKey, '1');
      } catch {
        // Some sandboxed contexts disallow storage; the app handles it.
      }
    },
    { skipKey: SKIP_AUTH, onboardKey: ONBOARDED }
  );
});

test('boots, creates a story, and saves it', async ({ page }) => {
  // Surface uncaught errors as test failures instead of silently passing.
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/');

  // ── 1. App shell mounts ────────────────────────────────────────────────
  // The "Create New Story" CTA is the first reliable signal that the
  // StorySelector mounted (post-auth-skip, pre-story).
  const createNewStory = page.getByRole('button', { name: /Create New Story/i });
  await expect(createNewStory).toBeVisible({ timeout: 15_000 });

  // ── 2. Create a new story ─────────────────────────────────────────────
  await createNewStory.click();

  const titleInput = page.getByPlaceholder(/Story title/i);
  await expect(titleInput).toBeVisible();
  await titleInput.fill('Smoke Test Story');

  // Default selected type ("Feature Film") is fine — just commit.
  // The button text is exactly "Create Story" so anchor with ^…$ to
  // disambiguate from "Create New Story".
  await page.getByRole('button', { name: /^Create Story$/ }).click();

  // ── 3. Writer view is reachable ───────────────────────────────────────
  // The StatusBar renders once a story is active; its word counter is the
  // cheapest, most stable signal that the app shell finished mounting.
  // We scope to `.status-bar` so we don't pick up "X words" in other panes.
  const statusBar = page.locator('.status-bar');
  await expect(statusBar).toBeVisible({ timeout: 15_000 });
  await expect(statusBar.getByText(/\d+\s*words?/i)).toBeVisible();

  // ── 4. Save round-trips through the StatusBar ─────────────────────────
  // "ControlOrMeta" handles both Linux/Windows and macOS runners.
  await page.keyboard.press('ControlOrMeta+s');

  // StatusBar's save button flips its label to "Saving…" then "Saved <ago>".
  // We accept either intermediate state — both prove the handler ran.
  const saveButton = statusBar.getByRole('button', { name: /Save/i });
  await expect(saveButton).toHaveText(/Saving|Saved/i, { timeout: 10_000 });

  // ── 5. No unhandled errors during the run ─────────────────────────────
  // Filter benign noise: Firebase "not configured", SW registration warnings,
  // the well-known ResizeObserver loop message.
  const fatal = consoleErrors.filter(
    (e) =>
      !/Firebase/i.test(e) &&
      !/service worker/i.test(e) &&
      !/ResizeObserver loop/i.test(e)
  );
  expect(fatal, fatal.join('\n')).toEqual([]);
});
