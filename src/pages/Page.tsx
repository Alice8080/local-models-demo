import { Flex } from 'antd';

import { ObjectsTable } from '@/components/ObjectsTable';

export type Mode = 'local' | 'online';

export function Page({ mode }: { mode: Mode }) {
  return (
    <Flex gap="large" vertical>
      <h1>
        Космические объекты
      </h1>
      <ObjectsTable mode={mode} />
    </Flex>
  );
}
