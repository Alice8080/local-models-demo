import {
  Card,
  Flex,
  Space,
  Typography,
} from 'antd';
import { OnlineChat } from './OnlineChat';

export function ObjectsInputForm({
  mode,
  setParams,
}: {
  mode: 'local' | 'online';
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
        <OnlineChat setParams={setParams} />
      </Flex>
    </Card>
  );
}
