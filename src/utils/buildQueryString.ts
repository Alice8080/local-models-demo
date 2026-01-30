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
