import js from "@eslint/js";
import globals from "globals";
import pluginVue from "eslint-plugin-vue";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import prettier from "@vue/eslint-config-prettier/skip-formatting";

export default defineConfigWithVueTs(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**",  "**/*.js", "build/**"],
  },
  js.configs.recommended,
  pluginVue.configs["flat/recommended"],
  vueTsConfigs.strictTypeChecked,
  vueTsConfigs.stylisticTypeChecked,
  {
    files: ["**/*.{ts,vue}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "vue/multi-word-component-names": ["error", { ignores: ["App"] }],
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  prettier,
);
