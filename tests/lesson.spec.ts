import { expect, test } from "@playwright/test";

test("new runs pause; individual operations can be stepped, rewound, scrubbed and replayed", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await page.getByText("More controls", { exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Orbit", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Prompt", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  const inspector = page.getByLabel("Live flow inspector");
  const timeline = page.getByLabel("Operation timeline");
  await expect(inspector).toHaveAttribute("data-part", "input");
  await expect(
    page.getByRole("button", { name: "Play simulation", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(250);
  await expect(timeline).toHaveValue("0");
  await page.getByRole("button", { name: "Next operation" }).click();
  await expect(inspector).toHaveAttribute("data-part", "split");
  await page.getByRole("button", { name: "Next operation" }).click();
  await expect(inspector).toHaveAttribute("data-part", "stamp");
  await page.getByRole("button", { name: "Next operation" }).click();
  await expect(page.getByLabel("Input tokens")).toContainText("INPUT / 1");
  await page.getByRole("button", { name: "Previous operation" }).click();
  await expect(page.getByLabel("Input tokens")).toContainText("INPUT / 0");
  const total = (await timeline.getAttribute("max"))!;
  await timeline.fill(total);
  await expect(
    page.getByRole("img", { name: /3D inference world/ }),
  ).toHaveAccessibleName(/Phase: done. 16 output tokens/);
  await timeline.fill("3");
  await expect(page.getByLabel("Input tokens")).toContainText("INPUT / 1");
  await page.getByRole("button", { name: "Replay simulation" }).click();
  await expect(timeline).toHaveValue("0");
  await page.getByLabel("Simulation speed").selectOption("4");
  await page
    .getByRole("button", { name: "Play simulation", exact: true })
    .click();
  await expect(inspector).toHaveAttribute("data-part", "split", {
    timeout: 4000,
  });
  await page.getByRole("button", { name: "Pause simulation" }).click();
  const progress = await inspector.getAttribute("data-progress");
  await page.waitForTimeout(300);
  await expect(inspector).toHaveAttribute("data-progress", progress!);
  expect(errors).toEqual([]);
});

test("guided part inspection pauses without seeking and occurrence navigation restores events", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await page.getByText("More controls", { exact: true }).click();
  await page
    .getByRole("button", { name: "Play simulation", exact: true })
    .click();
  await page.getByRole("button", { name: "3. ATTEND", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play simulation", exact: true }),
  ).toBeVisible();
  const timeline = page.getByLabel("Operation timeline");
  const before = await timeline.inputValue();
  await page.getByLabel("Machine part").selectOption("queries");
  await expect(timeline).toHaveValue(before);
  await expect(page.getByLabel("Live flow inspector")).toHaveAttribute(
    "data-part",
    "queries",
  );
  await page.getByRole("button", { name: "Next occurrence" }).click();
  await expect(page.getByLabel("Live flow inspector")).toContainText(
    "Query 1 reads",
  );
  const first = await timeline.inputValue();
  await page.getByLabel("Query head", { exact: true }).selectOption("2");
  await expect(page.getByLabel("Live flow inspector")).toContainText(
    "Query 2 reads",
  );
  await expect(timeline).toHaveValue(first);
  await expect(page.getByLabel("Live flow inspector")).toContainText(
    "All eight execute together",
  );
  await page.getByText("Explore the world", { exact: true }).click();
  await page
    .getByRole("button", { name: "Inspect Draft model", exact: true })
    .click();
  await page.getByLabel("Machine part").selectOption("propose");
  await expect(page.getByLabel("Live flow inspector")).toContainText(
    "Disabled",
  );
});

test("optimization switches rebuild a paused trace and retain paging preference", async ({
  page,
}) => {
  await page.goto("/prototype/inside-the-machine");
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await page.getByText("More controls", { exact: true }).click();
  await page.getByRole("button", { name: "Next operation" }).click();
  await page.getByRole("button", { name: "ENGINE LAB", exact: true }).click();
  for (const name of [
    "Grouped-query attention",
    "Continuous batching",
    "Speculative decoding",
  ]) {
    await page.getByRole("switch", { name, exact: true }).click();
    await expect(page.getByLabel("Operation timeline")).toHaveValue("0");
    await expect(
      page.getByRole("button", { name: "Play simulation", exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("switch", { name: "KV cache", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Paged attention", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("switch", { name: "Paged attention", exact: true }),
  ).toBeChecked();
  await page.getByRole("switch", { name: "KV cache", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Paged attention", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("switch", { name: "Paged attention", exact: true }),
  ).toBeChecked();
  await page.getByLabel("Temperature", { exact: true }).fill("1.2");
  await page.getByLabel("Top-k", { exact: true }).selectOption("1");
  await page.getByLabel("Output limit", { exact: true }).selectOption("8");
  await page.getByLabel("Batch size", { exact: true }).selectOption("4");
  const timeline = page.getByLabel("Operation timeline");
  await timeline.fill((await timeline.getAttribute("max"))!);
  await expect(
    page.getByRole("img", { name: /3D inference world/ }),
  ).toHaveAccessibleName(/Phase: done. 8 output tokens/);
  await page.getByRole("button", { name: "Reset simulation" }).click();
  await expect(timeline).toHaveCount(0);
});

test("creative flight locks, moves, hides HUD, releases and returns to guided views", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await page.getByText("More controls", { exact: true }).click();
  await page.getByRole("button", { name: "3. ATTEND", exact: true }).click();
  await page.getByLabel("Machine part").selectOption("queries");
  await page.getByText("Explore the world", { exact: true }).click();
  await page.getByRole("button", { name: "Fly mode", exact: true }).click();
  await page.locator("canvas").click({ position: { x: 600, y: 320 } });
  await expect
    .poll(() => page.evaluate(() => !!document.pointerLockElement))
    .toBe(true);
  const before = await page.locator("canvas").screenshot();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyW");
  expect((await page.locator("canvas").screenshot()).equals(before)).toBe(
    false,
  );
  await page.keyboard.press("KeyH");
  await expect(
    page.getByRole("button", { name: "Show interface" }),
  ).toBeVisible();
  await page.keyboard.press("KeyH");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => !!document.pointerLockElement))
    .toBe(false);
  await page.getByRole("button", { name: "Guided", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Guided", exact: true }),
  ).toHaveClass(/selected/);
});

test("bright world and all attachments render; paused geometry stays frozen", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await page.getByText("More controls", { exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: ".context/screenshots/redstone-overview.png" });
  await page.getByRole("button", { name: "ENGINE LAB", exact: true }).click();
  for (const name of [
    "KV cache",
    "Paged attention",
    "Grouped-query attention",
    "Continuous batching",
    "Speculative decoding",
  ]) {
    const canvas = page.locator("canvas");
    const before = await canvas.screenshot();
    await page.getByRole("switch", { name, exact: true }).click();
    await page.waitForTimeout(100);
    expect((await canvas.screenshot()).equals(before)).toBe(false);
    await page.getByRole("switch", { name, exact: true }).click();
  }
  await page.getByRole("button", { name: "3. ATTEND", exact: true }).click();
  await page.getByLabel("Machine part").selectOption("queries");
  await page.screenshot({ path: ".context/screenshots/redstone-part.png" });
  const before = await page.locator("canvas").screenshot();
  await page.waitForTimeout(300);
  expect((await page.locator("canvas").screenshot()).equals(before)).toBe(true);
});

test("mobile controls and inspector fit without horizontal overflow or panel overlap", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await page.getByText("More controls", { exact: true }).click();
  await expect(page.getByLabel("Live flow inspector")).toBeVisible();
  const inspector = await page.getByLabel("Live flow inspector").boundingBox();
  const prompt = await page
    .getByLabel("Prompt and generated tokens")
    .boundingBox();
  expect(prompt!.y + prompt!.height).toBeLessThanOrEqual(inspector!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "ENGINE LAB" }).click();
  await page.getByRole("switch", { name: "Speculative decoding" }).click();
  await page.getByRole("button", { name: "ENGINE LAB" }).click();
  await page.getByRole("button", { name: "3. ATTEND", exact: true }).click();
  await page.getByLabel("Machine part").selectOption("queries");
  await page.waitForTimeout(200);
  await page.screenshot({ path: ".context/screenshots/redstone-mobile.png" });
});

test("normal-motion playback freezes geometry and resumes the same operation", async ({
  page,
}) => {
  await page.goto("/prototype/inside-the-machine");
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await page
    .getByRole("button", { name: "Play simulation", exact: true })
    .click();
  await page.waitForTimeout(350);
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  const inspector = page.getByLabel("Live flow inspector");
  const operation = await inspector.getAttribute("data-operation");
  const progress = await inspector.getAttribute("data-progress");
  await page.waitForTimeout(3000); // Allow the guided camera to finish settling.
  const before = await page.locator("canvas").screenshot();
  await page.waitForTimeout(250);
  expect((await page.locator("canvas").screenshot()).equals(before)).toBe(true);
  await expect(inspector).toHaveAttribute("data-progress", progress!);
  await page
    .getByRole("button", { name: "Play simulation", exact: true })
    .click();
  await expect(inspector).not.toHaveAttribute("data-progress", progress!);
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await expect(inspector).toHaveAttribute("data-operation", operation!);
});

test("first visit has one fixed prompt; starting reveals a large lesson overlay", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(1);
  await expect(dialog).toContainText("How does AI come up with an answer?");
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue(
    "How does AI come up with an answer?",
  );
  await expect(page.getByLabel("Prompt", { exact: true })).not.toBeEditable();
  await expect(page.getByLabel("Inference settings")).toHaveCount(0);
  await expect(page.getByLabel("Machine part", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Operation timeline")).not.toBeVisible();
  await expect(page.getByLabel("Live flow inspector")).toContainText(
    "A token is a piece of text",
  );
  await expect
    .poll(async () => (await page.locator("canvas").boundingBox())?.width)
    .toBe(page.viewportSize()!.width);
  const world = await page.locator("canvas").boundingBox();
  const lesson = await page.getByLabel("Live flow inspector").boundingBox();
  expect(lesson!.x).toBeGreaterThan(world!.width * 0.6);
  expect(lesson!.x + lesson!.width).toBeLessThanOrEqual(world!.width);
  expect(lesson!.height).toBeGreaterThan(650);
  await expect(
    page.getByRole("button", { name: "Play simulation", exact: true }),
  ).toBeFocused();
});

test("arrow keys step and pause playback while preserving input navigation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await page.getByText("More controls", { exact: true }).click();
  const timeline = page.getByLabel("Operation timeline");
  await page.keyboard.press("ArrowLeft");
  await expect(timeline).toHaveValue("0");
  await page.keyboard.press("ArrowRight");
  await expect(timeline).toHaveValue("1");
  await page.keyboard.press("ArrowLeft");
  await expect(timeline).toHaveValue("0");
  await page.getByLabel("Prompt", { exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(timeline).toHaveValue("0");
  await page
    .getByRole("button", { name: "Play simulation", exact: true })
    .click();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Play simulation", exact: true }),
  ).toBeVisible();
  const paused = await timeline.inputValue();
  await page.waitForTimeout(150);
  await expect(timeline).toHaveValue(paused);
  const total = (await timeline.getAttribute("max"))!;
  await timeline.fill(total);
  await page.getByText("More controls", { exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(timeline).toHaveValue(total);
  await page.keyboard.press("ArrowLeft");
  await expect(timeline).toHaveValue(String(Number(total) - 1));
});

test("overview labels stay compact and stepping returns to the active lesson", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await page.getByRole("button", { name: "WORLD VIEW", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "From your question to the next word" }),
  ).toBeVisible();
  await expect(page.locator(".overview-marker")).toHaveCount(6);
  await expect(
    page.locator(".station-label:not(.overview-marker)"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "3. ATTEND", exact: true }).click();
  await expect(page.getByLabel("Live flow inspector")).toHaveAttribute(
    "data-target",
    "attention",
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Live flow inspector")).toHaveAttribute(
    "data-target",
    "tokenize",
  );
  await expect(page.getByLabel("Live flow inspector")).toHaveAttribute(
    "data-part",
    "split",
  );
});

test("lesson starts expanded and can collapse without losing the selected LLM part", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await page.getByRole("button", { name: "Process your prompt" }).click();
  const part = page.getByLabel("Machine part", { exact: true });
  await expect(part).toBeVisible();
  await expect(part.locator("option:checked")).toHaveText("Prompt input");
  await page.getByText("Hide lesson", { exact: true }).click();
  await expect(part).not.toBeVisible();
  await page.getByText("Show lesson", { exact: true }).click();
  await expect(part).toBeVisible();
  await expect(part).toHaveValue("input");
  await page.getByRole("button", { name: "4. THINK", exact: true }).click();
  await expect(part.locator("option")).toHaveText([
    "Select a part",
    "FFN up-projection",
    "Activation function",
    "FFN down-projection",
  ]);
});

test("component explanation pauses without seeking and closes with Escape", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await page.getByRole("button", { name: "Process your prompt" }).click();
  await page.getByRole("button", { name: "2. EMBED", exact: true }).click();
  const inspector = page.getByLabel("Live flow inspector");
  const operation = await inspector.getAttribute("data-operation");
  await page.getByLabel("Machine part", { exact: true }).selectOption("lookup");
  await page.getByRole("button", { name: "Explain component" }).click();
  const popup = page.getByRole("dialog", { name: "Token embedding lookup" });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Look up a representative vector");
  await expect(
    popup.getByRole("button", { name: "Close component explanation" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(inspector).toHaveAttribute("data-operation", operation!);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Play simulation", exact: true }),
  ).toBeVisible();
});
