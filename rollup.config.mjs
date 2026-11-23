import peerDepsExternal from "rollup-plugin-peer-deps-external";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import copy from "rollup-plugin-copy";

export default {
  input: "src/index.ts",
  external: ["react", "react-dom"],
  output: [
    { file: "carousel/carousel.js", format: "cjs", sourcemap: true },
    { file: "carousel/carousel.mjs", format: "esm", sourcemap: true },
  ],
  plugins: [
    peerDepsExternal(),
    resolve(),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.build.json" }),
    copy({
      targets: [
        { src: "carousel.css", dest: "carousel",},
        { src: "core.css", dest: "carousel" },
      ],
      copyOnce: true,
      verbose: true,
    }),
  ],
};
