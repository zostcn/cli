import { createApp } from "vue";
import App from "./App.vue";
import { createAppRouter } from "./router";
import "./theme/tokens.css";

const app = createApp(App);
const router = createAppRouter();

// 组件渲染期异常兜底(console.error 留痕,不冒成白屏)。
app.config.errorHandler = (err, _vm, info) => {
  console.error("[app]", err, info);
};

app.use(router);
app.mount("#app");
