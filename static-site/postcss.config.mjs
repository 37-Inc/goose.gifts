import path from "node:path";
const config = {
  plugins: {
    tailwindcss: {
      config: path.join(import.meta.dirname, "tailwind.config.ts"),
    },
    autoprefixer: {},
  },
};
export default config;
