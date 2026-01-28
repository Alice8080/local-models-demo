import { Flex } from 'antd';

import { ObjectsTable } from '../components/ObjectsTable';

export function OnlineDemoPage() {
  return (
    <Flex gap="large" vertical>
      <h1>
        Космические объекты
      </h1>
      <ObjectsTable mode="online" />
    </Flex>
  );
}
