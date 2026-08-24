import { describe, expect, it } from 'vitest';

import { findRagItem, ragCatalogs } from '../../../src/application/rag';

describe('catálogos RAG empacotados', () => {
  it('mantém contagens, identificadores e os três comportamentos da fonte', () => {
    expect(ragCatalogs).toHaveLength(2);
    expect(ragCatalogs.map(({ id, itemCount }) => ({ id, itemCount }))).toEqual(
      [
        { id: 'reunioes-por-area', itemCount: 27 },
        { id: 'reunioes-rag', itemCount: 27 },
      ],
    );
    expect(
      new Set(
        ragCatalogs.flatMap((catalog) =>
          catalog.items.map((item) => item.kind),
        ),
      ),
    ).toEqual(new Set(['PROJECT', 'AD_HOC', 'SKIP']));
    expect(
      ragCatalogs.every((catalog) => catalog.assetUrl.endsWith('.json')),
    ).toBe(true);
  });

  it('interpreta projeto fixo, projeto contextual e avulso com campos distintos', () => {
    const fixed = ragCatalogs[0]?.items.find(
      (item) => item.event === 'CERTI Informa',
    );
    expect(fixed).toMatchObject({
      kind: 'PROJECT',
      channel: {
        project: 'F01C0078.0 Parada de Aprendizagem',
        activity: '1.2 CERTI informa',
        projectSource: 'FIXED',
      },
    });
    const contextual = ragCatalogs[1]?.items.find(
      (item) => item.event === 'Reunião quinzenal UX',
    );
    expect(contextual).toMatchObject({
      kind: 'PROJECT',
      channel: {
        project: null,
        activity: null,
        projectSource: 'TAG',
        activitySource: 'TAG',
      },
    });
    const adHoc = ragCatalogs[0]?.items.find(
      (item) => item.event === 'Lightning Talk',
    );
    expect(adHoc).toMatchObject({
      kind: 'AD_HOC',
      channel: {
        client: 'CERTI',
        operationNature: '13. Formação/Capacitação',
        activityType: '99601 - Lightning Talk',
      },
    });
    expect(findRagItem('reunioes-por-area', adHoc?.id)).toEqual(adHoc);
  });

  it('não torna executável uma orientação de não apontar', () => {
    expect(
      ragCatalogs[0]?.items.find((item) => item.kind === 'SKIP'),
    ).toMatchObject({ event: 'Atestados / Ausências', channel: null });
  });
});
