import { Flex } from 'antd';

import { ObjectsTable } from '../components/ObjectsTable';

export function LocalDemoPage() {
  return (
    <Flex gap="large" vertical>
      <h1>
        Космические объекты
      </h1>
      <ObjectsTable mode="local" />
    </Flex>
  );
}
