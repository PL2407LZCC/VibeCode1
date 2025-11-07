export default [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ignores: ["node_modules", "dist", "build", "coverage"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {}
  }
];
