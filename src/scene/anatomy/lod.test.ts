import { describe, expect, it } from 'vitest';
import { chooseLod, type DeviceCaps } from './lod';

const desk: DeviceCaps = { coarse: false, width: 1440, dpr: 2, memory: 8 };

describe('chooseLod', () => {
  it('celular, tela estreita ou pouca memória: lo', () => {
    expect(chooseLod({ ...desk, coarse: true, renderer: 'Apple M2 Max' })).toBe('lo');
    expect(chooseLod({ ...desk, width: 800, renderer: 'NVIDIA GeForce RTX 4070' })).toBe('lo');
    expect(chooseLod({ ...desk, memory: 2, renderer: 'NVIDIA GeForce RTX 4070' })).toBe('lo');
  });

  it('GPU por software: lo', () => {
    expect(chooseLod({ ...desk, renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' })).toBe('lo');
    expect(chooseLod({ ...desk, renderer: 'llvmpipe (LLVM 15.0.7, 256 bits)' })).toBe('lo');
  });

  it('integrada ou desconhecida: mid', () => {
    expect(chooseLod({ ...desk, renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' })).toBe('mid');
    expect(chooseLod({ ...desk, renderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' })).toBe('mid');
    expect(chooseLod(desk)).toBe('mid');
  });

  it('dedicada de entrada ou Apple M base: hi', () => {
    expect(chooseLod({ ...desk, renderer: 'ANGLE (NVIDIA, NVIDIA GeForce MX450 Direct3D11 vs_5_0 ps_5_0, D3D11)' })).toBe('hi');
    expect(chooseLod({ ...desk, renderer: 'Apple M1' })).toBe('hi');
  });

  it('dedicada forte: ultra só com memória e tela que justifiquem', () => {
    const rtx = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)';
    expect(chooseLod({ ...desk, renderer: rtx })).toBe('ultra');
    expect(chooseLod({ coarse: false, width: 1440, dpr: 2, renderer: 'Apple M3 Pro' })).toBe('ultra');
    expect(chooseLod({ ...desk, memory: 4, renderer: rtx })).toBe('hi');
    expect(chooseLod({ ...desk, dpr: 1, width: 1280, renderer: rtx })).toBe('hi');
  });

  it('escolha do usuário vence', () => {
    expect(chooseLod({ ...desk, coarse: true, override: 'ultra' })).toBe('ultra');
  });
});
