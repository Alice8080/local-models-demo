import { useState } from 'react';
import { Button, Divider, Flex, Input } from 'antd';

export function OnlineInputText({ setQuery }: { setQuery: (query: string) => void }) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    setQuery(text);
  };

  return (
    <div>
      <Divider titlePlacement="start">
        <span className="font-bold">Текстовый ввод</span>
      </Divider>
      <Flex align="center" gap="large">
        <Input
          value="найди объекты на геостационарной орбите"
          onChange={(event) => setText(event.target.value)}
          placeholder="Напишите запрос или описание объекта"
        />
        <Button type="primary" onClick={handleSubmit}>
          Отправить
        </Button>
      </Flex>
    </div>
  );
}
