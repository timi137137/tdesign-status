import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import path from 'path';
import Components from 'unplugin-vue-components/vite';
import { ConfigEnv, loadEnv, UserConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import svgLoader from 'vite-svg-loader';

const CWD = process.cwd();

const toKebabCase = (name: string) =>
  name
    .replace(/^T/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

const tdesignStyleAliases: Record<string, string> = {
  Aside: 'layout',
  Header: 'layout',
  Content: 'layout',
  Footer: 'layout',
  Row: 'grid',
  Col: 'grid',
  HeadMenu: 'menu',
  MenuItem: 'menu',
  Submenu: 'menu',
  DropdownMenu: 'dropdown',
  DropdownItem: 'dropdown',
  TabPanel: 'tabs',
  FormItem: 'form',
  Option: 'select',
  TimelineItem: 'timeline',
  ListItem: 'list',
  ListItemMeta: 'list',
  DescriptionsItem: 'descriptions',
  RadioGroup: 'radio',
  RadioButton: 'radio',
  CheckboxGroup: 'checkbox',
  StepItem: 'steps',
  CollapsePanel: 'collapse',
  BreadcrumbItem: 'breadcrumb',
  DateRangePicker: 'date-picker',
  ColorPickerPanel: 'color-picker',
  ColorPicker: 'color-picker',
};

const tdesignResolver = (name: string) => {
  if (!/^T[A-Z]/.test(name)) return undefined;
  const componentName = name.slice(1);
  if (componentName === 'Icon') {
    return {
      name: 'default',
      from: path.resolve(__dirname, 'src/components/tdesign-icon/LocalIcon.vue').replace(/\\/g, '/'),
    };
  }
  const styleName = tdesignStyleAliases[componentName] || toKebabCase(name);
  return {
    name: componentName,
    from: 'tdesign-vue-next',
    sideEffects: `tdesign-vue-next/es/${styleName}/style/css.mjs`,
  };
};

// https://vitejs.dev/config/
export default ({ mode }: ConfigEnv): UserConfig => {
  const { VITE_BASE_URL, VITE_API_URL_PREFIX } = loadEnv(mode, CWD);
  return {
    base: VITE_BASE_URL,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    css: {
      preprocessorOptions: {
        less: {
          modifyVars: {
            hack: `true; @import (reference) "${path.resolve('src/style/variables.less')}";`,
          },
          math: 'strict',
          javascriptEnabled: true,
        },
      },
    },

    plugins: [
      vue(),
      vueJsx(),
      Components({
        dts: false,
        resolvers: [tdesignResolver],
      }),
      svgLoader(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'prompt',
        injectRegister: 'auto',
        manifest: {
          name: '腾讯服务状态',
          short_name: '服务状态',
          description: '腾讯服务状态与运维管理平台',
          lang: 'zh-CN',
          start_url: '/',
          display: 'standalone',
          background_color: '#f3f3f3',
          theme_color: '#0052d9',
          icons: [{ src: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' }],
        },
        devOptions: {
          enabled: false,
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,svg,png,webp}'],
        },
      }),
    ],

    server: {
      port: 3002,
      host: '0.0.0.0',
      proxy: {
        [VITE_API_URL_PREFIX]: 'http://127.0.0.1:3000/',
      },
    },
    build: {
      cssCodeSplit: true,
      target: 'es2022',
      sourcemap: false,
      manifest: true,
    },
  };
};
