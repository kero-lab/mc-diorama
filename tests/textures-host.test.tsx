import { vi, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DataTexture } from 'three';
import type { MeshStandardMaterial } from 'three';

vi.mock('@react-three/fiber', () => ({ useLoader: (_l: unknown, urls: string[]) => urls.map(() => new DataTexture(new Uint8Array(4), 1, 1)) }));
import { useBlockMaterials } from '../src/scene/textures';
import { withHost } from './test-host';

it('two hosts with different assetBase get different materials for the same block name', () => {
  const got: MeshStandardMaterial[] = [];
  const Probe = () => { got.push(useBlockMaterials(['stone'])[0]); return null; };
  render(withHost(<Probe />, { assetBase: '/a' }));
  render(withHost(<Probe />, { assetBase: '/b' }));
  expect(got[0]).not.toBe(got[1]);
  render(withHost(<Probe />, { assetBase: '/a' }));
  expect(got[2]).toBe(got[0]);
});
