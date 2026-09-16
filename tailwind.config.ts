import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  plugins: [
    forms({
      strategy: "class",
    }),
  ],
};

export default config;
