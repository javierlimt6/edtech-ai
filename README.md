# vis.ai

A bright Minecraft superflat learning world built with Three.js and React Three Fiber. Open redstone machines expose individual inference operations.

## Run

```sh
npm install
npm run dev
```

Open **http://localhost:5173/prototype/inside-the-machine**. Requires WebGL. Fonts and procedural textures are local assets; there are no API keys or external runtime services.

## Explore

- **Start:** a blurred-world introduction offers one fixed prompt: “How does AI come up with an answer?” Click **Process your prompt** to dock the card at bottom left and open the paused lesson. The prompt is read-only for this version. Follow text → tokens → embeddings → attention → feed-forward → sampling → output.
- **Route:** stations 1–6 run left to right, with matching numbers on signs, part overlays, the dock, and the lesson. Helpers are labelled by their relationship to the main route. Output loops back to stage 2 for the next token.
- **Guided:** select a station in the world or dock for a fixed close-up. Select a machine part in the inspector or world to pause and move closer, without changing simulation time.
- **Follow:** track the current operation’s part automatically.
- **Fly mode:** click the world to capture the mouse. WASD moves, mouse looks, Space/E ascends, Q descends, Shift boosts. Flight travels at 36 world units/second, or 90 with Shift. Aim at parts to inspect; click a targeted part to pause and open its guided close-up. Escape releases the pointer; H hides/shows the interface. Guided controls also support touch and keyboard.
- **Playback:** previous/next operation, full-run timeline, replay, and play/pause. Each operation takes 3 seconds at 1×; speeds range from 0.25× to 4×. Scrubbing pauses, and resuming continues from the selected position. Background tabs pause playback.
- **Lesson overlay:** a large floating panel on the right explains the current stage in plain language, what to watch, and the takeaway. Engine Lab, camera tools, machine details, and extra playback controls start collapsed. On narrow screens the lesson flows below the world and prompt. Expand **Machine details** for purpose, current action, input, expected output, and live counts. Previous/next occurrence jumps to that part’s events. All parts and disabled attachments remain discoverable through keyboard-accessible controls.
- **Shared trace:** packets, redstone activity, token/output state, cache allocation, and readouts use the same operation snapshots. Rewinding restores them together. Reduced motion suppresses interpolation without changing operation timing or state.
- Prompt completion and workload completion are separate: the scheduler continues until all eight requests finish.

## Experiment

Engine presets configure editable switches; they do not run vLLM or another real serving engine.

- **KV cache:** reuse context, or switch caching off to reprocess the growing context on every decode pass. Paging becomes inapplicable while caching is off; its selected preference is retained.
- **Paged attention:** reserve whole KV pages as context grows; the storage attachment shows allocated blocks beside its page-table controller.
- **GQA:** eight query heads share two KV heads. KV storage falls by four in this toy architecture; query-to-KV connections change in the world.
- **Continuous batching:** fill freed lanes without waiting for the slowest request in a batch. Eight deterministic requests make the scheduling difference visible.
- **Speculative decoding:** draft up to three tokens, verify against the target simulation, and show accepted, rejected, and unverified discarded guesses. A mismatch emits the target correction and stops that draft group. Output matches the target-only run for the same prompt and sampling settings.
- **Temperature, top-k, output limit, batch size:** change actual sampling or scheduler behavior. Configuration changes rebuild the current trace and pause at its beginning.

This is an **illustrative simulation, not a trained LLM**. Tokenization splits words/punctuation; candidate continuations come from small authored vocabularies, with normalized temperature-adjusted probabilities and deterministic sampling. No neural-network weights are loaded. Metrics count prompt token processing/recomputation, reused context, target passes, draft/verification work, workload idle lane steps, and abstract KV token-head slots—not GPU benchmarks. Each part operation has the same illustrative duration; extra work and memory pressure are shown explicitly, without fabricated hardware timing. The world depicts one representative transformer layer; production models repeat layers.

## Validate

```sh
npm test          # simulation invariants, sampling, batching, speculation
npm run test:e2e  # Google Chrome: prompt flow, flight, settings, mobile, reduced motion
npm run build    # TypeScript and static production bundle
npm run preview  # serve dist/
```

Static hosting needs an `index.html` fallback for the prototype URL.

## World and trace

Stations, attachments, redstone wiring, and flat grass terrain use procedural voxel geometry and pixel textures. The factory stacks machines and worker lanes on evenly spaced, supported floors, with lift platforms for vertical travel. It exposes eight parallel attention heads, shared or separate KV banks, and representative 8 → 32 → 8 feed-forward lanes. Station signs use locally bundled Silkscreen. Steve/Alex-style workers carry token and feature bundles along service aisles; weight drawers stay stationary. Crews are bounded representations, not a count of real model dimensions. All eight attention heads execute in one trace event; the inspector can inspect each head without moving time.

Character rendering is isolated in `src/Workers.tsx`; replacing `Workers` with its `SignalCarriers` renderer preserves the factory and activity data without adding a view toggle. Terrain is instanced; the 3D bundle loads separately from the application shell. KV storage and the draft branch appear only when enabled; paging, GQA, and batching modify the existing machines. The older Blender source/export remain in the repository but are no longer loaded.

`src/trace.ts` defines the shared part catalog and deterministic before/after operation snapshots. The stage engine in `src/sim.ts` remains the reference for toy-model outcomes; tests compare all 32 optimization combinations. Session state is local and resets on reload.

## Technical references

- [vLLM paged attention design](https://docs.vllm.ai/en/latest/design/paged_attention/)
- [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://arxiv.org/abs/2305.13245)
- [vLLM speculative decoding](https://docs.vllm.ai/en/latest/features/speculative_decoding/)

The old prediction/recall lesson has been replaced by direct experimentation. This remains a throwaway prototype, with session-only state.
