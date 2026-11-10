import { type Config } from "prettier";

const config: Config = {
  semi: true,
  singleQuote: false,
  trailingComma: "es5",
  printWidth: 90,
  tabWidth: 2,
  tailwindFunctions: ["cn", "cva", "clsx"],
  tailwindStylesheet: "src/app/globals.css",
  plugins: ["prettier-plugin-organize-imports", "prettier-plugin-tailwindcss"],
};

export default config;
