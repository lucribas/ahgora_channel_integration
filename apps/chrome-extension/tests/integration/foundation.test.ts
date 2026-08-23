import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../..');

describe('MV3 foundation', () => {
  it('uses activeTab and only the exact optional host needed by the Ahgora iframe', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(projectRoot, 'manifest.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe('116');
    expect(manifest.permissions).toEqual([
      'activeTab',
      'scripting',
      'storage',
      'sidePanel',
    ]);
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest.optional_host_permissions).toEqual([
      'https://mirror.app.ahgora.com.br/*',
    ]);
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
    expect(JSON.stringify(manifest)).not.toContain('cookies');
  });

  it('provides the approved pt-BR side panel without any submit control', async () => {
    const html = await readFile(
      resolve(projectRoot, 'src/ui/side-panel.html'),
      'utf8',
    );
    const parsed = new DOMParser().parseFromString(html, 'text/html');

    expect(parsed.documentElement.lang).toBe('pt-BR');
    expect(
      parsed.querySelector('main[aria-labelledby="title"]'),
    ).not.toBeNull();
    expect(parsed.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(parsed.body.textContent).toContain('Capturar e comparar');
    expect(parsed.body.textContent).toContain('Selecionar restantes');
    expect(parsed.body.textContent).toContain('Executar dry-run');
    expect(parsed.body.textContent).toContain('Aplicar selecionados');
    expect(parsed.body.textContent).toContain('Enviado');
    expect(parsed.body.textContent).toContain('indisponível');
    expect(parsed.body.textContent).toContain('nunca clica em Salvar');
    expect(parsed.querySelector<HTMLInputElement>('#project')?.value).toBe(
      'D15C0401.0 PETROBRAS_SUSTENTAÇÃO CERTIFICARE',
    );
    expect(parsed.querySelector<HTMLInputElement>('#activity')?.value).toBe(
      '1.3 ME04_Medição de agosto.26',
    );
    expect(
      parsed.querySelector<HTMLInputElement>('#activity-type')?.value,
    ).toBe('Nenhum');
    expect(parsed.querySelector<HTMLInputElement>('#task')?.value).toBe(
      'Nenhum',
    );
    expect(parsed.querySelector('form')).toBeNull();
    expect(parsed.querySelector('button[type="submit"]')).toBeNull();
  });
});
