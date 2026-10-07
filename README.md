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

## License

MIT
