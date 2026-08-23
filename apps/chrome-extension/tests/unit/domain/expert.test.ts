import { describe, expect, it } from 'vitest';

import { civilDate } from '../../../src/domain/civil-date';
import { assignExpertProject } from '../../../src/domain/expert';

const DATE = civilDate('2026-08-18');

describe('Expert ativo', () => {
  it('aloca toda a duração positiva em um único PROJETOS com defaults', () => {
    expect(
      assignExpertProject(
        { date: DATE, durationMinutes: 450 },
        { project: 'PROJETO_SINTETICO', activity: 'ATIVIDADE_SINTETICA' },
      ),
    ).toEqual({
      kind: 'PROJETOS',
      project: 'PROJETO_SINTETICO',
      activityType: 'Nenhum',
      activity: 'ATIVIDADE_SINTETICA',
      task: 'Nenhum',
      date: DATE,
      durationMinutes: 450,
      duration: '07:30',
      comments: '',
    });
  });

  it('preserva tipo de atividade e tarefa configurados', () => {
    const assignment = assignExpertProject(
      { date: DATE, durationMinutes: 60 },
      {
        project: 'PROJETO_SINTETICO',
        activity: 'ATIVIDADE_SINTETICA',
        activityType: 'TIPO_SINTETICO',
        task: 'TAREFA_SINTETICA',
      },
    );
    expect(assignment.activityType).toBe('TIPO_SINTETICO');
    expect(assignment.task).toBe('TAREFA_SINTETICA');
  });

  it.each([0, -1, -600])(
    'rejeita duração não positiva: %i',
    (durationMinutes) => {
      expect(() =>
        assignExpertProject(
          { date: DATE, durationMinutes },
          { project: 'PROJETO_SINTETICO', activity: 'ATIVIDADE_SINTETICA' },
        ),
      ).toThrow('maior que zero');
    },
  );
});
