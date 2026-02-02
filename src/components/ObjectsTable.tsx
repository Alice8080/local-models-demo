import { useEffect, useMemo, useState } from 'react';
import { Alert, Table } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';

import { SearchForm } from '@/components/SearchForm';
import type { Mode } from '@/pages/Page';

type SpaceObject = {
  id: string;
  [key: string]: unknown;
};

type SpaceObjectsResponse = {
  items: number;
  data: SpaceObject[];
};

type FieldsResponse = Record<string, string>;

const DEFAULT_PAGE_SIZE = 10;
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

interface Props {
  mode: Mode;
}

export function ObjectsTable({ mode }: Props) {
  const [fields, setFields] = useState<FieldsResponse>({});
  const [data, setData] = useState<SpaceObject[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadFields = async () => {
      setIsLoadingFields(true);
      setError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/fields`);
        if (!response.ok) {
          throw new Error('Не удалось загрузить заголовки таблицы.');
        }
        const result = (await response.json()) as FieldsResponse;
        if (isActive) {
          setFields(result);
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : 'Произошла ошибка.');
        }
      } finally {
        if (isActive) {
          setIsLoadingFields(false);
        }
      }
    };

    loadFields();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadSpaceObjects = async () => {
      setIsLoadingData(true);
      setError(null);

      try {
        const url = new URL(`${API_BASE_URL}/space-objects`);
        url.searchParams.set('_page', String(page));
        url.searchParams.set('_per_page', String(pageSize));
        const extraParams = new URLSearchParams(params);
        extraParams.forEach((value, key) => {
          url.searchParams.set(key, value);
        });

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Не удалось загрузить данные таблицы.');
        }
        const result = (await response.json()) as SpaceObjectsResponse;
        if (isActive) {
          const normalized = result.data.map((item) => ({
            ...item,
            orbitalPeriod: item.orbitalPeriod ?? null,
          }));
          setData(normalized);
          setTotalItems(result.items ?? 0);
        }
      } catch (err) {
        if (isActive) {
          setError(err instanceof Error ? err.message : 'Произошла ошибка.');
        }
      } finally {
        if (isActive) {
          setIsLoadingData(false);
        }
      }
    };

    loadSpaceObjects();

    return () => {
      isActive = false;
    };
  }, [page, pageSize, params]);

  const columns = useMemo<ColumnsType<SpaceObject>>(() => {
    return Object.entries(fields)
      .filter(([key]) => key !== 'id')
      .map(([key, title]) => ({
        title: <span style={{ whiteSpace: 'normal' }}>{title}</span>,
        dataIndex: key,
        key,
        ellipsis: true,
        render: (value: unknown) => (value ?? '—') as string | number,
      }));
  }, [fields]);

  const handleTableChange = (pagination: TablePaginationConfig) => {
    const nextPage = pagination.current ?? 1;
    const nextSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    setPage(nextPage);
    setPageSize(nextSize);
  };

  return (
    <>
      <SearchForm mode={mode} setParams={setParams} />
      {error && <Alert type="error" message={error} showIcon />}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={isLoadingFields || isLoadingData}
        pagination={{
          current: page,
          pageSize,
          total: totalItems,
          showSizeChanger: true,
        }}
        scroll={{ x: 'max-content' }}
        onChange={handleTableChange}
      />
    </>
  );
}
