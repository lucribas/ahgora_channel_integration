import type { CivilDate } from '../domain';

export interface ChannelCatalogActivity {
  readonly id: string;
  readonly label: string;
}

export interface ChannelCatalogProject {
  readonly id: string;
  readonly label: string;
  readonly activities: readonly ChannelCatalogActivity[];
}

export interface ChannelCatalog {
  readonly fetchedAt: string;
  readonly projects: readonly ChannelCatalogProject[];
}

export interface ChannelTag {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
  readonly project: string;
  readonly activityId: string;
  readonly activity: string;
  readonly activityType?: string;
  readonly task?: string;
}

export interface MarkingTemplateEntry {
  readonly id: string;
  readonly tagId?: string;
  readonly ragCatalogId?: string;
  readonly ragItemId?: string;
  /** Percentual observado no dia de origem. */
  readonly percentage: number;
  /** Duração observada no dia de origem. */
  readonly durationMinutes: number;
}

export interface MarkingTemplate {
  readonly id: string;
  readonly name: string;
  readonly sourceDurationMinutes: number;
  readonly entries: readonly MarkingTemplateEntry[];
  readonly createdAt: string;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RuleTemplateShare {
  readonly templateId: string;
  readonly percentage: number;
}

export type RecurrenceEnd =
  | { readonly kind: 'never' }
  | { readonly kind: 'on'; readonly date: CivilDate }
  | { readonly kind: 'after'; readonly occurrences: number };

export interface TemplateApplicationRule {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly repeatEveryWeeks: number;
  readonly weekdays: readonly Weekday[];
  readonly startsOn: CivilDate;
  readonly ends: RecurrenceEnd;
  readonly templates: readonly RuleTemplateShare[];
}

export interface ExtensionSettings {
  readonly version: 1;
  readonly tags: readonly ChannelTag[];
  readonly defaultTagId?: string;
  readonly catalog?: ChannelCatalog;
  readonly fontScale: number;
  readonly fontScaleCustomized?: boolean;
  readonly markingTemplates: readonly MarkingTemplate[];
  readonly templateRules: readonly TemplateApplicationRule[];
}

type StoredExtensionSettings = Omit<
  ExtensionSettings,
  'markingTemplates' | 'templateRules'
> & {
  readonly markingTemplates?: readonly MarkingTemplate[];
  readonly templateRules?: readonly TemplateApplicationRule[];
};

const KEY = 'extensionSettings';

const INITIAL_TAG: ChannelTag = {
  id: 'initial-default',
  name: 'Padrão',
  projectId: '',
  project: 'D15C0401.0 PETROBRAS_SUSTENTAÇÃO CERTIFICARE',
  activityId: '',
  activity: '1.3 ME04_Medição de agosto.26',
  activityType: 'Nenhum',
  task: 'Nenhum',
};

export function defaultExtensionSettings(): ExtensionSettings {
  return {
    version: 1,
    tags: [INITIAL_TAG],
    defaultTagId: INITIAL_TAG.id,
    fontScale: 1.3,
    fontScaleCustomized: false,
    markingTemplates: [],
    templateRules: [],
  };
}

export async function loadExtensionSettings(): Promise<ExtensionSettings> {
  const stored = (await chrome.storage.local.get(KEY))[KEY];
  if (!isExtensionSettings(stored)) return defaultExtensionSettings();
  const needsMigration =
    stored.fontScaleCustomized === undefined ||
    stored.markingTemplates === undefined ||
    stored.templateRules === undefined;
  const normalized: ExtensionSettings = {
    ...stored,
    fontScale:
      stored.fontScaleCustomized === undefined && stored.fontScale === 1
        ? 1.3
        : stored.fontScale,
    fontScaleCustomized: stored.fontScaleCustomized ?? stored.fontScale !== 1,
    markingTemplates: stored.markingTemplates ?? [],
    templateRules: stored.templateRules ?? [],
  };
  if (needsMigration) await saveExtensionSettings(normalized);
  return normalized;
}

export async function saveExtensionSettings(
  settings: ExtensionSettings,
): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

function isExtensionSettings(value: unknown): value is StoredExtensionSettings {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ExtensionSettings>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.tags) &&
    typeof candidate.fontScale === 'number' &&
    (candidate.markingTemplates === undefined ||
      Array.isArray(candidate.markingTemplates)) &&
    (candidate.templateRules === undefined ||
      Array.isArray(candidate.templateRules)) &&
    (candidate.fontScaleCustomized === undefined ||
      typeof candidate.fontScaleCustomized === 'boolean')
  );
}
