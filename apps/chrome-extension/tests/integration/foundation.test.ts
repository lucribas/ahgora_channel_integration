import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { defaultExtensionSettings } from '../../src/application/settings';

const projectRoot = resolve(import.meta.dirname, '../..');

describe('MV3 foundation', () => {
  it('uses activeTab for operations and only exact optional hosts for login assistance', async () => {
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
      'https://www.ahgora.com.br/*',
      'https://app.ahgora.com.br/*',
      'https://channel.certi.org.br/*',
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
    expect(parsed.body.textContent).toContain('Enviar selecionados');
    expect(parsed.body.textContent).toContain(
      '3. Conjuntos e regras automáticas',
    );
    expect(parsed.body.textContent).toContain('5. Revisar e selecionar dias');
    expect(parsed.body.textContent).toContain('6. Enviar ao Channel');
    expect(parsed.body.textContent).toContain(
      'Um clique envia todos os itens selecionados',
    );
    expect(parsed.body.textContent).toContain(
      'Definição de marcações de ponto no Channel',
    );
    expect(parsed.querySelector('#fetch-catalog')).not.toBeNull();
    expect(parsed.querySelector('details#login-card[open]')).not.toBeNull();
    expect(
      parsed.querySelectorAll('details.workflow-card.collapsible-card'),
    ).toHaveLength(6);
    expect(parsed.querySelectorAll('details.workflow-card[open]')).toHaveLength(
      1,
    );
    expect(parsed.querySelector('#review-actions')).not.toBeNull();
    expect(parsed.querySelector('#send-actions')).not.toBeNull();
    expect(parsed.querySelector('#stop-login')).not.toBeNull();
    expect(parsed.querySelector('#stop-capture')).not.toBeNull();
    expect(parsed.querySelector('#stop-write')).not.toBeNull();
    expect(
      parsed.querySelector('#review-actions #select-remaining'),
    ).not.toBeNull();
    expect(parsed.querySelector('#send-actions #apply')).not.toBeNull();
    expect(
      parsed.querySelector<HTMLSelectElement>('select#tag-project'),
    ).not.toBeNull();
    expect(parsed.querySelector('#tag-activity')).not.toBeNull();
    expect(parsed.querySelector('#font-decrease')).not.toBeNull();
    expect(parsed.querySelector('#font-increase')).not.toBeNull();
    expect(
      parsed.querySelector<HTMLOptionElement>(
        '#period-kind option[value="month"]',
      )?.selected,
    ).toBe(true);
    expect(parsed.querySelector('#month-field[hidden]')).toBeNull();
    expect(
      parsed.querySelector<HTMLImageElement>(
        'img.hero-logo[src="../../assets/clock_monster_logo.png"]',
      ),
    ).not.toBeNull();
    expect(parsed.querySelector('.hero-copy > #new-operation')).not.toBeNull();
    expect(defaultExtensionSettings().tags[0]).toMatchObject({
      project: 'D15C0401.0 PETROBRAS_SUSTENTAÇÃO CERTIFICARE',
      activity: '1.3 ME04_Medição de agosto.26',
    });
    expect(defaultExtensionSettings().fontScale).toBe(1.3);
    expect(defaultExtensionSettings().markingTemplates).toEqual([]);
    expect(defaultExtensionSettings().templateRules).toEqual([]);
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
