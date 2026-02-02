import { Flex } from 'antd';

import { ObjectsTable } from '@/components/ObjectsTable';

export function Page({ mode }: { mode: 'local' | 'online' }) {
  return (
    <Flex gap="large" vertical>
      <h1>
        Космические объекты
      </h1>
      <ObjectsTable mode={mode} />
    </Flex>
  );
}
