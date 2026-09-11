/* eslint-disable simple-import-sort/imports */
import { createApp } from 'vue';

import App from './App.vue';
import router from './router';
import { store } from './store/pinia';

import 'tdesign-vue-next/es/style/css.mjs';
import '@/style/index.less';
import './permission';

const app = createApp(App);

app.use(store);
app.use(router);

app.mount('#app');
