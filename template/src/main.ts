import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { ApiError } from './api/types';
import { onAuthCleared } from './api/memory';
import { createAuthGuard } from './router/guard';
import { createAppRouter } from './router';
import { vPermission } from './directives/permission';
import { vSafeHtml } from './directives/safe-html';
import { useSystemStore } from './stores/system';
import './theme/tokens.css';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

// 生成的 vue-query hooks 需要 Provider —— 少了它,第一个 useQuery 就炸
app.use(VueQueryPlugin, { queryClient: new QueryClient() });

app.directive('safe-html', vSafeHtml);
app.directive('permission', vPermission);

const router = createAppRouter();
router.beforeEach(createAuthGuard(router));

// 第一道网(§2.4):导航期抛出的 unavailable 错误若再冒给 vue-router,
// 导航会被**静默取消** —— 症状是整站白屏且刷新无效。吞掉,停在当前页。
router.onError((err) => {
  if (err instanceof ApiError && err.kind === 'unavailable') {
    return;
  }
  console.error('[router]', err);
});

// 第二道网(§2.4):组件渲染期异常。router.onError 管不到这块。
app.config.errorHandler = (err, _vm, info) => {
  console.error('[app]', err, info);
};

app.use(router);

// 401 分流:store 的清态挂在 memory 总线(client 发事件),这里只负责跳转。
onAuthCleared(() => {
  if (router.currentRoute.value.path !== '/login') {
    void router.replace({ path: '/login', query: { reason: 'expired' } });
  }
});

// store 的总线订阅要在 pinia 激活后、首次导航( mount)前完成
const store = useSystemStore();
store.bindAuthCleared();

app.mount('#app');
