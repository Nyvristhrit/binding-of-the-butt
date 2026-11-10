// Builds dist/BindingOfTheButt-v<version>.zip: mod folder, companion.exe, installer, README.
// Usage: node tools/release.js
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { version } = require(path.join(root, "companion", "package.json"));
const name = `BindingOfTheButt-v${version}`;
const out = path.join(root, "dist", name);

execSync("npm run build", { cwd: path.join(root, "companion"), stdio: "inherit" });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "binding of the butt"), { recursive: true });
for (const f of ["main.lua", "metadata.xml"]) fs.copyFileSync(path.join(root, "mod", f), path.join(out, "binding of the butt", f));
fs.copyFileSync(path.join(root, "dist", "companion.exe"), path.join(out, "companion.exe"));
fs.copyFileSync(path.join(root, "tools", "install.bat"), path.join(out, "install.bat"));
fs.copyFileSync(path.join(root, "README.md"), path.join(out, "README.md"));

const zip = `${out}.zip`;
fs.rmSync(zip, { force: true });
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${out}\\*' -DestinationPath '${zip}'"`, { stdio: "inherit" });
console.log(`Release ready: ${zip}`);
