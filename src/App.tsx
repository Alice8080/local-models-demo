import React, { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import {
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonFilled,
  SunFilled,
} from '@ant-design/icons';
import {
  Button,
  ConfigProvider,
  Layout,
  Menu,
  Space,
  Switch,
  Typography,
  theme,
} from 'antd';
import ru from 'antd/locale/ru_RU';

import { HomePage } from './pages/HomePage';

const { Header, Sider, Content } = Layout;
const THEME_STORAGE_KEY = 'local-models-theme';

const AppShell: React.FC<{
  isDarkMode: boolean;
  onToggleTheme: (value: boolean) => void;
}> = ({ isDarkMode, onToggleTheme }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { token } = theme.useToken();

  const menuItems = useMemo(
    () => [
      {
        key: '/',
        icon: <HomeOutlined />,
        label: <Link to="/">Домашняя</Link>,
      },
    ],
    [],
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        trigger={null}
        collapsed={collapsed}
        width={240}
        style={{
          background: token.colorBgContainer,
          borderRight: `1px solid ${token.colorSplit}`,
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            paddingInline: collapsed ? 16 : 20,
            gap: 12,
            borderBottom: `1px solid ${token.colorSplit}`,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: token.colorPrimary,
              display: 'grid',
              placeItems: 'center',
              color: token.colorWhite,
              fontWeight: 700,
            }}
          >
            LM
          </div>
          {!collapsed && (
            <div>
              <Typography.Text strong style={{ display: 'block' }}>
                Local Models
              </Typography.Text>
              <Typography.Text type="secondary">Client-side AI</Typography.Text>
            </div>
          )}
        </div>
        <Menu
          mode="inline"
          items={menuItems}
          style={{ borderInline: 'none' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            paddingInline: 16,
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorSplit}`,
          }}
        >
          <Space
            align="center"
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            <Space align="center" size={12}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((prev) => !prev)}
              />
              <Typography.Title level={4} style={{ margin: 0 }}>
                Демо локальных моделей
              </Typography.Title>
            </Space>
            <Space align="center" size={12}>
              <Typography.Text type="secondary">Тема</Typography.Text>
              <Switch
                checked={isDarkMode}
                onChange={onToggleTheme}
                checkedChildren={<MoonFilled />}
                unCheckedChildren={<SunFilled />}
              />
            </Space>
          </Space>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 'calc(100vh - 64px - 56px)',
            background: token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
          }}
          className={isDarkMode ? 'dark' : 'light'}
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark';
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
    document.body.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#4f46e5',
        },
      }}
      locale={ru}
    >
      <AppShell isDarkMode={isDarkMode} onToggleTheme={setIsDarkMode} />
    </ConfigProvider>
  );
};

export default App;
