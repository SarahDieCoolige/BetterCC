import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import js from "@eslint/js";

export default [
  {
    ignores: [
      "bettercc.user.js",
      "dev/fixture/**",
      "src/gm.d.ts",
      "src/upstream.d.ts",
      "stuff/**",
      "tmp/**",
      "node_modules/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2020, sourceType: "module" },
      globals: {
        unsafeWindow: "readonly",
        GM_addStyle: "readonly",
        GM_setValue: "readonly",
        GM_getValue: "readonly",
        GM_log: "readonly",
        GM_notification: "readonly",
        GM_getResourceText: "readonly",
        GM_info: "readonly",
        GM_listValues: "readonly",
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "warn",
      "no-undef": "off",
    },
  },
];
