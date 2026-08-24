import areaCatalogJson from '../../assets/rag/reunioes-por-area.json';
import areaCatalogUrl from '../../assets/rag/reunioes-por-area.json?url';
import ragCatalogJson from '../../assets/rag/reunioes-rag.json';
import ragCatalogUrl from '../../assets/rag/reunioes-rag.json?url';

export type RagItemKind = 'PROJECT' | 'AD_HOC' | 'SKIP';

export interface RagProjectTarget {
  readonly project: string | null;
  readonly activityType: string;
  readonly activity: string | null;
  readonly task: string;
  readonly projectSource: 'FIXED' | 'TAG';
  readonly activitySource: 'FIXED' | 'TAG';
}

export interface RagAdHocTarget {
  readonly client: string;
  readonly operationNature: string;
  readonly activityType: string;
}

interface RagItemBase {
  readonly id: string;
  readonly sourceLine: number;
  readonly group: string;
  readonly event: string;
  readonly durationHint: string | null;
  readonly comment: string | null;
  readonly warnings: readonly string[];
}

export type RagItem =
  | (RagItemBase & {
      readonly kind: 'PROJECT';
      readonly channel: RagProjectTarget;
    })
  | (RagItemBase & {
      readonly kind: 'AD_HOC';
      readonly channel: RagAdHocTarget;
    })
  | (RagItemBase & { readonly kind: 'SKIP'; readonly channel: null });

export interface RagCatalog {
  readonly version: 1;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sourceFile: string;
  readonly itemCount: number;
  readonly items: readonly RagItem[];
  readonly assetUrl: string;
}

const loadCatalog = (value: unknown, assetUrl: string): RagCatalog => {
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    !Array.isArray(record.items) ||
    record.itemCount !== record.items.length
  ) {
    throw new Error('Catálogo RAG empacotado é inválido.');
  }
  const catalog = value as Omit<RagCatalog, 'assetUrl'>;
  return { ...catalog, assetUrl };
};

export const ragCatalogs: readonly RagCatalog[] = [
  loadCatalog(areaCatalogJson, areaCatalogUrl),
  loadCatalog(ragCatalogJson, ragCatalogUrl),
];

export function findRagItem(
  catalogId: string | undefined,
  itemId: string | undefined,
): RagItem | undefined {
  if (!catalogId || !itemId) return undefined;
  return ragCatalogs
    .find((catalog) => catalog.id === catalogId)
    ?.items.find((item) => item.id === itemId);
}
