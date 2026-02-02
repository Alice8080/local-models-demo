export type QueryFilter = {
  field: string;
  op: 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'ne';
  value: string | number | boolean;
};

export type QueryParams = {
  filters: QueryFilter[];
};

export const buildQueryString = (filters: QueryFilter[]) => {
  if (!filters.length) return '';
  return filters
    .map((filter) => {
      const key = `${filter.field}_${filter.op}`;
      const value = String(filter.value);
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');
};

export const isQueryParams = (value: unknown): value is QueryParams => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.filters)) return false;
  return record.filters.every((filter) => {
    if (!filter || typeof filter !== 'object') return false;
    const filterRecord = filter as Record<string, unknown>;
    return (
      typeof filterRecord.field === 'string' &&
      typeof filterRecord.op === 'string' &&
      'value' in filterRecord
    );
  });
};
