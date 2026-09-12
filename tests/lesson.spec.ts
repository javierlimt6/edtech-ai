import { expect, test } from "@playwright/test";

test("prompt input flows through the model and emits a token; controls restart cleanly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/prototype/inside-the-machine");
  await expect(page.locator("canvas")).toBeVisible();
  await page
    .getByLabel("Prompt", { exact: true })
    .fill("Build a Minecraft forest");
  await page.getByRole("button", { name: "Advance one stage" }).click();
  for (const phase of [
    "tokenize",
    "embed",
    "attention",
    "ffn",
    "sample",
    "emit",
  ]) {
    await expect(
      page.getByRole("img", { name: /3D inference world/ }),
    ).toHaveAccessibleName(new RegExp(`Phase: ${phase}`));
    await page.getByRole("button", { name: "Advance one stage" }).click();
  }
  await expect(
    page.getByRole("img", { name: /3D inference world/ }),
  ).toHaveAccessibleName(/1 output tokens/);
  await page.getByRole("switch", { name: "Grouped-query attention" }).click();
  await expect(
    page.getByRole("switch", { name: "Grouped-query attention" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("img", { name: /3D inference world/ }),
  ).toHaveAccessibleName(/Phase: tokenize. 0 output tokens/);
  await expect(page.locator(".configuration-notice")).toContainText(
    "Run restarted",
  );
  await page.getByLabel("INFERENCE PRESET").selectOption("reference");
  for (const name of [
    "Paged attention",
    "Grouped-query attention",
    "Continuous batching",
    "Speculative decoding",
  ])
    await expect(
      page.getByRole("switch", { name, exact: true }),
    ).not.toBeChecked();
  await page.getByLabel("INFERENCE PRESET").selectOption("speculative");
  await expect(
    page.getByRole("switch", { name: "Speculative decoding" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Reset simulation" }).click();
  await expect(
    page.getByRole("img", { name: /3D inference world/ }),
  ).toHaveAccessibleName(/Phase: idle/);
  expect(errors).toEqual([]);
});

test("creative flight locks, moves, supports HUD hiding, and releases with Escape", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Fly mode", exact: true }).click();
  await page.locator("canvas").click({ position: { x: 600, y: 400 } });
  await expect
    .poll(() => page.evaluate(() => !!document.pointerLockElement))
    .toBe(true);
  await expect(page.locator(".crosshair")).toBeVisible();
  const beforeFlight = await page.locator("canvas").screenshot();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(250);
  await page.keyboard.up("KeyW");
  const afterFlight = await page.locator("canvas").screenshot();
  expect(beforeFlight.equals(afterFlight)).toBe(false);
  await page.keyboard.down("Space");
  await page.waitForTimeout(200);
  await page.keyboard.up("Space");
  await page.keyboard.press("KeyH");
  await expect(
    page.getByRole("button", { name: "Show interface" }),
  ).toBeVisible();
  await page.keyboard.press("KeyH");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => !!document.pointerLockElement))
    .toBe(false);
  await expect(page.locator(".crosshair")).toHaveCount(0);
  await page.getByRole("button", { name: "Orbit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Orbit", exact: true }),
  ).toHaveClass(/selected/);
});

test("presets, sampling controls, playback, and reduced motion remain functional", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/prototype/inside-the-machine");
  await page.getByLabel("Temperature", { exact: true }).fill("1.2");
  await page.getByLabel("Top-k", { exact: true }).selectOption("1");
  await page.getByLabel("Output limit", { exact: true }).selectOption("8");
  await page.getByLabel("Batch size", { exact: true }).selectOption("4");
  await page.getByLabel("Simulation speed", { exact: true }).selectOption("4");
  await page.getByRole("button", { name: "SEND PROMPT", exact: true }).click();
  await page.getByRole("button", { name: "Pause simulation" }).click();
  await expect(
    page.getByRole("button", { name: "Play simulation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play simulation" }).click();
  await expect(
    page.getByRole("img", { name: /3D inference world/ }),
  ).toHaveAccessibleName(/Phase: done. 8 output tokens/, { timeout: 20000 });
  await page.getByRole("button", { name: /03.*ATTEND/ }).click();
  await expect(page.locator("h1")).toHaveText("ATTENTION.");
  await expect(
    page
      .getByLabel("Explore inference stages")
      .getByRole("button", { name: /ATTEND/ }),
  ).toHaveClass(/active/);
});

test("mobile layout has no horizontal overflow and settings can be opened and closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/prototype/inside-the-machine");
  await expect(page.locator("#engine-panel")).toHaveCount(0);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "SEND PROMPT", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("button", { name: "ENGINE LAB" }).click();
  await expect(page.locator("#engine-panel")).toBeVisible();
  await page.getByRole("switch", { name: "Speculative decoding" }).click();
  await page.getByRole("button", { name: "ENGINE LAB" }).click();
  await expect(page.locator("#engine-panel")).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: ".context/screenshots/v2-mobile.png" });
});
