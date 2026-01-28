import {
  Card,
  Flex,
  Space,
  Typography,
} from 'antd';
import { OnlineInputText } from './OnlineInputText';
import { OnlineInputAudio } from './OnlineInputAudio';
import { InputText } from './inputText/InputText';
import { InputAudio } from './inputAudio/InputAudio';

export function ObjectsInputForm({
  mode,
  setQuery,
}: {
  mode: 'local' | 'online';
  setQuery: (query: string) => void;
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
        {mode === 'local' ? (
          <>
            <InputAudio setQuery={setQuery} />
            <InputText setQuery={setQuery} />
          </>
        ) : (
          <>
            <OnlineInputAudio setQuery={setQuery} />
            <OnlineInputText setQuery={setQuery} />
          </>
        )}
      </Flex>
    </Card>
  );
}
