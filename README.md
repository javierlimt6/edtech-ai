# InferenceCraft — Inside the Machine

An immersive, Minecraft-inspired inference sandbox built with Three.js, React Three Fiber, and an original Blender-authored transformer landmark.

## Run

```sh
npm install
npm run dev
```

Open **http://localhost:5173/prototype/inside-the-machine**. Requires WebGL. Fonts, the Blender model, and procedural textures are local assets; there are no API keys or external runtime services.

## Explore

- **Send prompt:** follow text → tokens → embeddings → attention → feed-forward → sampling → output. The decode loop reuses the KV cache.
- **Orbit:** drag to rotate, scroll to zoom. Click a station or its dock button to inspect it.
- **Follow token:** the camera follows the active inference stage.
- **Fly mode:** click the world to capture the mouse. WASD moves, mouse looks, Space/E ascends, Q descends, Shift boosts. Escape releases the pointer; H hides/shows the interface. Flight requires a desktop browser with pointer-lock support; orbit also supports touch.
- Pause, advance one stage, or change playback speed. Background tabs pause playback.

## Experiment

Engine presets configure editable switches; they do not run vLLM or another real serving engine.

- **Paged attention:** reserve whole KV pages as context grows; the cache yard scatters physical pages and attention reads across them.
- **GQA:** eight query heads share two KV heads. KV storage falls by four in this toy architecture; query-to-KV connections change in the world.
- **Continuous batching:** fill freed lanes without waiting for the slowest request in a batch. Eight deterministic requests make the scheduling difference visible.
- **Speculative decoding:** draft up to three tokens, verify against the target simulation, and show accepted/rejected guesses. A mismatch emits the target correction and stops that draft group. Output matches the target-only run for the same prompt and sampling settings.
- **Temperature, top-k, output limit, batch size:** change actual sampling or scheduler behavior. Configuration changes restart the current run to keep its architecture and state consistent.

This is an **illustrative simulation, not a trained LLM**. Tokenization splits words/punctuation; candidate continuations come from small authored vocabularies, with normalized temperature-adjusted probabilities and deterministic sampling. No neural-network weights are loaded. Metrics are token counts, simulation passes, and abstract KV token-head slots—not GPU benchmarks. The world depicts one representative transformer layer; production models repeat layers.

## Validate

```sh
npm test          # simulation invariants, sampling, batching, speculation
npm run test:e2e  # Google Chrome: prompt flow, flight, settings, mobile, reduced motion
npm run build    # TypeScript and static production bundle
npm run preview  # serve dist/
```

Static hosting needs an `index.html` fallback for the prototype URL.

## Blender assets

`assets/blender/transformer-core.blend` is the editable source; `public/models/transformer-core.glb` is the runtime export. The generation script joins geometry by material, so the landmark uses five material groups despite hundreds of voxel parts.

Rebuild using Blender 4.5+:

```sh
blender --background --python assets/blender/build_world.py
```

Other terrain, mountains, trees, stations, token packets, cache pages, and request characters are procedural Three.js geometry. The large terrain uses instancing; the application shell loads separately from the 3D bundle. Reduced motion disables decorative movement and camera tweening while retaining manual navigation.

## Technical references

- [vLLM paged attention design](https://docs.vllm.ai/en/latest/design/paged_attention/)
- [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://arxiv.org/abs/2305.13245)
- [vLLM speculative decoding](https://docs.vllm.ai/en/latest/features/speculative_decoding/)

The old prediction/recall lesson has been replaced by direct experimentation. This remains a throwaway prototype, with session-only state.
