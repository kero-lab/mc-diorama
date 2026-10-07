import { render, screen } from '@testing-library/react';
import { DioramaHostProvider, useDioramaHost, type DioramaHost } from '../src/host';

const host: DioramaHost = {
  loadRecording: async () => 'none', assetBase: '/mc', prefsKey: 'test:prefs',
  schematicLabel: () => null, schematicName: () => 'Unknown schematic',
  Button: props => <button {...props} />,
};
function Probe() { const h = useDioramaHost(); return <span>{h.assetBase}</span>; }

it('provides the host to the tree', () => {
  render(<DioramaHostProvider host={host}><Probe /></DioramaHostProvider>);
  expect(screen.getByText('/mc')).toBeInTheDocument();
});
it('throws a clear error without a provider', () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => render(<Probe />)).toThrow(/DioramaHostProvider/);
  err.mockRestore();
});
