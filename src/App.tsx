import React, { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import {
  TableOutlined,
  StarOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonFilled,
  SunFilled,
} from '@ant-design/icons';
import {
  Button,
  ConfigProvider,
  Drawer,
  Grid,
  Layout,
  Menu,
  Space,
  Switch,
  Typography,
  theme,
} from 'antd';
import ru from 'antd/locale/ru_RU';

import { Page } from '@/pages/Page';

const { Header, Sider, Content } = Layout;
const THEME_STORAGE_KEY = 'local-models-theme';

const AppShell: React.FC<{
  isDarkMode: boolean;
  onToggleTheme: (value: boolean) => void;
}> = ({ isDarkMode, onToggleTheme }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const menuItems = useMemo(
    () => [
      {
        key: '/',
        icon: <StarOutlined />,
        label: <Link to="/">Локальное демо</Link>,
      },
      {
        key: '/online-demo',
        icon: <TableOutlined />,
        label: <Link to="/online-demo">Онлайн демо</Link>,
      },
    ],
    [],
  );

  return (
    <Layout className="min-h-screen">
      {!isMobile && (
        <Sider
          collapsible
          trigger={null}
          collapsed={collapsed}
          width={220}
          className="border-r"
          style={{
            background: token.colorBgContainer,
            borderRightColor: token.colorSplit,
          }}
        >
          <div
            className={`flex h-16 items-center gap-3 border-b ${
              collapsed ? 'px-4' : 'px-5'
            }`}
            style={{ borderBottomColor: token.colorSplit }}
          >
            <div
              className="grid h-9 w-9 place-items-center rounded-xl font-bold"
              style={{
                background: token.colorPrimary,
                color: token.colorWhite,
              }}
            >
              LM
            </div>
            {!collapsed && (
              <div>
                <Typography.Text strong className="block">
                  Local Models
                </Typography.Text>
                <Typography.Text type="secondary">Client-side AI</Typography.Text>
              </div>
            )}
          </div>
          <Menu
            mode="inline"
            items={menuItems}
            className="border-0"
          />
        </Sider>
      )}
      <Layout>
        <Header
          className="border-b !px-6"
          style={{
            background: token.colorBgContainer,
            borderBottomColor: token.colorSplit,
          }}
        >
          <div className="flex w-full items-center justify-between gap-2">
            <Space align="center" className="min-w-0">
              <Button
                type="text"
                icon={
                  isMobile ? (
                    <MenuUnfoldOutlined />
                  ) : collapsed ? (
                    <MenuUnfoldOutlined />
                  ) : (
                    <MenuFoldOutlined />
                  )
                }
                onClick={() => {
                  if (isMobile) {
                    setIsMobileMenuOpen((prev) => !prev);
                  } else {
                    setCollapsed((prev) => !prev);
                  }
                }}
              />
              <Typography.Title
                level={isMobile ? 5 : 4}
                className="m-0 min-w-0 truncate text-base sm:text-lg"
              >
                Демо локальных моделей
              </Typography.Title>
            </Space>
            <Space
              align="center"
              className="justify-start w-auto justify-end"
            >
              <Switch
                checked={isDarkMode}
                onChange={onToggleTheme}
                checkedChildren={<MoonFilled />}
                unCheckedChildren={<SunFilled />}
              />
            </Space>
          </div>
        </Header>
        <Content
          className={`min-h-[calc(100vh-64px-56px)] p-4 md:p-6 mx-3 my-4 sm:mx-4 sm:my-6 ${
            isDarkMode ? 'dark' : 'light'
          }`}
          style={{
            background: token.colorBgContainer,
            borderRadius: token.borderRadiusLG,
          }}
        >
          <Routes>
          <Route path="/" element={<Page mode="local" />} />
          <Route path="/online-demo" element={<Page mode="online" />} />
          </Routes> 
        </Content>
      </Layout>
      <Drawer
        open={isMobile && isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        placement="left"
        classNames={{ body: 'p-0', header: 'p-4' }}
        title={
          <Space align="center" size={12}>
            <div
              className="grid h-8 w-8 place-items-center rounded-lg font-bold"
              style={{
                background: token.colorPrimary,
                color: token.colorWhite,
              }}
            >
              LM
            </div>
            <div>
              <Typography.Text strong className="block">
                Local Models
              </Typography.Text>
              <Typography.Text type="secondary">Client-side AI</Typography.Text>
            </div>
          </Space>
        }
      >
        <Menu
          mode="inline"
          items={menuItems}
          className="border-0"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      </Drawer>
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
