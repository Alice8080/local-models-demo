import {
  Card,
  Flex,
  Space,
  Typography,
} from 'antd';
import { Chat } from '@/components/Chat';
import type { Mode } from '@/pages/Page';

export function SearchForm({
  mode,
  setParams,
}: {
  mode: Mode;
  setParams: (params: string) => void;
}) {
  return (
    <Card>
      <Flex gap="middle" vertical>
        <Space vertical>
          <h2>Поиск</h2>
          <Typography.Text type="secondary">
            Используйте голосовой или текстовый ввод для поиска объектов.
          </Typography.Text>
        </Space>
        <Chat mode={mode} setParams={setParams} />
      </Flex>
    </Card>
  );
}
