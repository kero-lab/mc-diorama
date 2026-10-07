# @kero-lab/mc-diorama

Rem's Minecraft diorama: rebuilds a run in 3D from the controller's event stream, live or from a stored recording.
Used by RemHub (with the debug layers) and Rem Live on KeroHub (public layers only).

## Install

```bash
npm install @kero-lab/mc-diorama
```

> Requires `NPM_TOKEN` for GitHub Packages auth. Ships TypeScript source: add it to Next's `transpilePackages`
> and to Tailwind's `@source`.

## Usage

```tsx
import { Diorama, DioramaHostProvider } from '@kero-lab/mc-diorama';

<DioramaHostProvider host={myHost}>
  <Diorama source={{ live: true }} feed={feed} />
</DioramaHostProvider>
```

`myHost` supplies everything site-specific (recordings, asset base URL, schematic names, a Button). The package
makes no network calls. Debug layers (X-ray, planner timings): `import { DEBUG_LAYERS } from '@kero-lab/mc-diorama/debug'`.

### Rem Live API (0.2.0)

Cameras: `cameras` picks the selector's cameras (`BUILTIN_CAMERA_IDS` by default; `CAMERA_IDS` adds `'custom'`, whose `CustomCameraParams` live in the viewer's prefs and pass through `sanitizeCustom`).

```tsx
<Diorama source={{ live: true }} feed={feed} cameras={[...BUILTIN_CAMERA_IDS, 'custom']} />
const params = sanitizeCustom({ ...DEFAULT_CUSTOM, anchor: 'next_jump', distance: 12 }); // clamps stale or hand-edited presets
```

Layers and size: `layers` swaps the layer set (default `PUBLIC_LAYERS`, no planner internals), and `compact` drops the controls and panels.

```tsx
<Diorama source={source} feed={feed} layers={DEBUG_LAYERS} compact />  // DEBUG_LAYERS from '@kero-lab/mc-diorama/debug'
```

Activities: an `ActivityModule` defines what an activity's stats, attempt and progress are; `PARKOUR_ACTIVITY` is the built-in one, and `activityFor(id)` looks one up.

```ts
const stats = PARKOUR_ACTIVITY.liveStats(timeline, frame);
const activity = activityFor('parkour'); // ActivityModule | null
```

Pace comparison: `paceIndex` indexes a recorded run, `paceAt` says whether a live run is ahead or behind it, and `PaceTrack` draws that.

```tsx
const record = useMemo(() => paceIndex(recordTimeline, PARKOUR_ACTIVITY), [recordTimeline]);
const pace = paceAt(live, T, record, PARKOUR_ACTIVITY);
<PaceTrack live={live} T={T} record={record} activity={PARKOUR_ACTIVITY} />
```

Side window: `SideWindow` replays a record run at the same progress; `activity` must be a stable reference (a module constant), or it re-seeks every render. `seekToProgress` on `Diorama` does the same for a single view.

```tsx
<SideWindow recordRunId={recordId} atProgress={score} activity={PARKOUR_ACTIVITY} />
<Diorama source={{ runId }} seekToProgress={{ value: score, activity: PARKOUR_ACTIVITY }} />
```

Rewind window: `rewindWindowMs` limits how far back a live view can scrub (`null`, the default, is unlimited).

```tsx
<Diorama source={{ live: true }} feed={feed} rewindWindowMs={5 * 60_000} />
```

### Rem Live host features (0.3.0)

Every new prop is opt-in and the defaults keep 0.2.0 behaviour, so existing hosts (RemHub) need no change.

Public-stream folding: the public event stream (`{ type: 'score', runId, score }` events and a flat `cause` on the run end) folds into the same timeline as the private one. `DEATH_CAUSE_WORDS` and `END_WORDS` are the word maps behind the death and end labels.

```ts
const word = Object.hasOwn(DEATH_CAUSE_WORDS, cause) ? DEATH_CAUSE_WORDS[cause] : cause;
const ended = END_WORDS[reason]; // 'fell', 'stopped early', 'time limit', ...
```

Controlled view: `camera` / `onCameraChange` and `customParams` / `onCustomParamsChange` let the host own the camera state; `persistPrefs={false}` stops the diorama reading and writing the viewer's prefs; `viewControls={false}` hides the camera/rotation/X-ray picker and `panels={false}` hides the layer panels. `onFrame` reports the playhead (a `DioramaFrameInfo`: timeline, frame, `T`, `live`, `behindMs`, `status`) for pages that draw their own HUD.

```tsx
<Diorama source={{ live: true }} feed={feed} cameras={CAMERA_IDS} camera={cam} onCameraChange={setCam}
  customParams={params} onCustomParamsChange={setParams} persistPrefs={false} viewControls={false} panels={false}
  onFrame={f => setBehind(f.behindMs)} />
```

Custom camera editing: `CustomCameraPanel` edits the `CustomCameraParams` (ranges in `CUSTOM_LIMITS`). While the custom camera is active and `onCustomParamsChange` is set, the stage also takes drag (yaw/pitch), wheel (distance) and keyboard control; `orbit()` is the pure step behind it. Keep `customParams` in state: an inline object literal is a new value every render and re-renders the canvas each time.

```tsx
<CustomCameraPanel value={params} onChange={setParams} />
const next = orbit(params, { dx: 12, dy: -4, zoomSteps: 1 }); // returns clamped params
```

Schematics: the catalogue (names, descriptions, previews) ships in the package, so a host needs no schematic API. Previews are relative to the host's `assetBase`.

```ts
schematicName(id);                    // 'Unknown schematic' when not in the catalogue
schematicLabel(id, dataSha)?.name;    // null for an unknown id or a stale dataSha
const src = `${assetBase}/${schematicPreview(id)}`; // '1.21.11/schematics/<file>' under assets/
```

## License

MIT
