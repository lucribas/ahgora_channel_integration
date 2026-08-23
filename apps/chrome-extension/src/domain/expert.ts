import { assertIntegerMinutes, formatDurationMinutes } from './duration';
import type { CivilDate, WorkRecord } from './types';

export interface ExpertConfig {
  readonly project: string;
  readonly activity: string;
  readonly activityType?: string;
  readonly task?: string;
}

export interface ProjectAssignment {
  readonly kind: 'PROJETOS';
  readonly project: string;
  readonly activityType: string;
  readonly activity: string;
  readonly task: string;
  readonly date: CivilDate;
  readonly durationMinutes: number;
  readonly duration: string;
  readonly comments: '';
}

export function assignExpertProject(
  record: WorkRecord,
  config: ExpertConfig,
): ProjectAssignment {
  assertIntegerMinutes(record.durationMinutes);
  if (record.durationMinutes <= 0) {
    throw new Error('A duração deve ser maior que zero');
  }

  return {
    kind: 'PROJETOS',
    project: config.project,
    activityType: config.activityType ?? 'Nenhum',
    activity: config.activity,
    task: config.task ?? 'Nenhum',
    date: record.date,
    durationMinutes: record.durationMinutes,
    duration: formatDurationMinutes(record.durationMinutes),
    comments: '',
  };
}
