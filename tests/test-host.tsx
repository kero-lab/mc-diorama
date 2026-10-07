import type { ReactElement } from 'react';
import { DioramaHostProvider, type DioramaHost } from '../src/host';

export const TEST_HOST: DioramaHost = {
  loadRecording: async () => 'none',
  assetBase: '/minecraft',
  prefsKey: 'remhub:rem-mc:diorama',
  schematicLabel: () => null,
  schematicName: () => 'Unknown schematic',
  Button: props => <button {...props} />,
};

export function withHost(ui: ReactElement, overrides: Partial<DioramaHost> = {}) {
  return <DioramaHostProvider host={{ ...TEST_HOST, ...overrides }}>{ui}</DioramaHostProvider>;
}
