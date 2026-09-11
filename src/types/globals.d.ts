/// <reference types="vite/client" />
/// <reference types="vue/jsx" />

// 通用声明

// Vue
declare module '*.vue' {
  import { DefineComponent } from 'vue';

  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare type ClassName = { [className: string]: any } | ClassName[] | string;

declare module '*.svg?component' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent;
  export default component;
}

declare module '*.svg' {
  const CONTENT: string;
  export default CONTENT;
}

declare type Recordable<T = any> = Record<string, T>;
