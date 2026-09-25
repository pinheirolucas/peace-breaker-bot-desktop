import type { StorybookConfig } from "@storybook/react-vite";

// Dev-only surface. There is deliberately no build-storybook script and no
// publish step: `vite build` bundles only what src/index.tsx reaches, and
// nothing in the app imports a story, so none of this can land in build/.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} }
};

export default config;
