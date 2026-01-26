//@ts-check
import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";

const watch = process.argv.includes("--watch");
const minify = process.argv.includes("--minify");

const success = watch ? "Watch build succeeded" : "Build succeeded";

function getTime() {
  const date = new Date();
  return `[${`${padZeroes(date.getHours())}:${padZeroes(date.getMinutes())}:${padZeroes(date.getSeconds())}`}] `;
}

function padZeroes(i) {
  return i.toString().padStart(2, "0");
}

const plugins = [
  {
    name: "watch-plugin",
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length === 0) {
          console.log(getTime() + success);
        }
      });
    },
  },
  {
    name: "copy-html-plugin",
    setup(build) {
      build.onEnd(() => {
        // Copy HTML template to output directory
        const srcPath = path.join("src", "extension", "webview-template.html");
        const destPath = path.join("out", "extension", "webview-template.html");

        try {
          // Ensure destination directory exists
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }

          // Copy file
          fs.copyFileSync(srcPath, destPath);
          console.log(
            getTime() + "Copied webview-template.html to out directory",
          );
        } catch (error) {
          console.error("Failed to copy HTML template:", error);
        }
      });
    },
  },
];

const ctx = await esbuild.context({
  // Entry points for the vscode extension and the language server
  entryPoints: ["src/extension/main.ts", "src/language/main.ts"],
  outdir: "out",
  bundle: true,
  target: "ES2017",
  // VSCode's extension host is still using cjs, so we need to transform the code
  format: "cjs",
  // To prevent confusing node, we explicitly use the `.cjs` extension
  outExtension: {
    ".js": ".cjs",
  },
  loader: { ".ts": "ts" },
  external: ["vscode"],
  platform: "node",
  sourcemap: !minify,
  minify,
  plugins,
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  ctx.dispose();
}
