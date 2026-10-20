const config = {
  content: {
    relative: true,
    files: [
      "./app/**/*.{ts,tsx}",
      "./components/**/*.{ts,tsx}",
      "../components/**/*.{ts,tsx}",
    ],
  },
  theme: { extend: { colors: { brand: "#c2410c" } } },
  plugins: [],
};
export default config;
