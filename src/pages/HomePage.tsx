import { useEffect, useMemo, useState } from 'react';
import { Alert, Flex, Table, Typography } from 'antd';

import { ObjectsTable } from '../components/ObjectsTable';

export function HomePage() {

  return (
    <Flex className="page" gap="large" vertical>
      <Typography.Title level={2} style={{ margin: 0 }}>
        Космические объекты
      </Typography.Title>
      <ObjectsTable />
    </Flex>
  );
}
