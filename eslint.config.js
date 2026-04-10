import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // 核心：禁止隐式 any
      "@typescript-eslint/no-explicit-any": "error",
      // 未使用的变量
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

    },
  },
  {
    ignores: ["dist/", "node_modules/"],
  },
);
