import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["src/api/generated/**", "dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      // .vue 的 script 也跑在浏览器里(window/setInterval)。.ts 侧 no-undef 被
      // typescript-eslint 的 eslint-recommended 关掉了,.vue 没有这层豁免 —— 不设就会误报。
      globals: { ...globals.browser },
    },
  },
  {
    rules: {
      // B11:HTML 只能走 v-safe-html(带清洗),裸 v-html 默认禁止。
      // 真要用 v-safe-html 也会被这条按 no-v-html 抓 —— eslint-disable 是唯一出口,留痕。
      "vue/no-v-html": "error",
      // 模板是给六个项目抄的,中英文混排按能读懂为准,不引入风格插件
      "vue/multi-word-component-names": "off",
    },
  },
  {
    // 首帧脚本跑在**浏览器**里(document/localStorage),按浏览器 globals 校验
    files: ["public/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  // ⚠️ 必须是**最后一项**:关掉上面所有配置里与 Prettier 冲突的**格式类规则**
  // (vue/max-attributes-per-line、quotes 之类)。分工从此固定:
  // **Prettier 管格式(`npm run format`,IDE 保存时插件同款),ESLint 只管质量**
  // —— 两边各按各的风格写同一批文件,就会出现「格式化一次、eslint --fix 打回来」的拉锯。
  prettier,
);
