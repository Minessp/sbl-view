import { describe, expect, it } from 'vitest';
import { effectsFor, SHED_ORDER } from './tiers';

describe('effectsFor', () => {
  it('GPU por software fica sem pipeline (o material faz o tom)', () => {
    const fx = effectsFor({ renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', coarse: false });
    expect(fx.hdr).toBe(false);
    expect(fx.bloom || fx.dof || fx.ao || fx.reflect).toBe(false);
    expect(fx.shadow).toBe(false);
  });

  it('GPU dedicada liga tudo', () => {
    const fx = effectsFor({ renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11)', coarse: false });
    expect(fx).toMatchObject({ hdr: true, bloom: true, ao: true, dof: true });
  });

  it('integrada sem reflexo; celular só bloom', () => {
    expect(effectsFor({ renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620)', coarse: false }).reflect).toBe(false);
    const phone = effectsFor({ renderer: 'Adreno (TM) 650', coarse: true });
    expect(phone).toMatchObject({ hdr: true, bloom: true, ao: false, dof: false });
  });

  it('o governador tira na ordem: reflexo, profundidade, oclusão, bloom', () => {
    const r = 'NVIDIA GeForce RTX 3070';
    expect(SHED_ORDER).toEqual(['reflect', 'dof', 'ao', 'bloom']);
    expect(effectsFor({ renderer: r, coarse: false, shed: 1 })).toMatchObject({ reflect: false, dof: true });
    expect(effectsFor({ renderer: r, coarse: false, shed: 2 })).toMatchObject({ dof: false, ao: true });
    expect(effectsFor({ renderer: r, coarse: false, shed: 9 })).toMatchObject({ hdr: true, bloom: false, ao: false });
  });

  it('escolha manual vence', () => {
    expect(effectsFor({ renderer: 'NVIDIA GeForce RTX 3070', coarse: false, override: 'off' }).hdr).toBe(false);
    expect(effectsFor({ renderer: 'SwiftShader', coarse: false, override: 'high' }).dof).toBe(true);
  });
});
