import { spawn } from "child_process";
import path from "path";
import os from "os";

const jdkPath = path.join(os.homedir(), ".cache", "jdk-21.0.13+9");
const env = {
  ...process.env,
  JAVA_HOME: jdkPath,
  PATH: `${path.join(jdkPath, "bin")}${path.delimiter}${process.env.PATH}`,
};

const args = process.argv.slice(2);
const target = args.length > 0 ? args.join(" ") : "";
const testCmd = `npx vitest run ${target}`.trim();

const isWindows = process.platform === "win32";
const firebaseCmd = isWindows ? "npx.cmd" : "npx";

const emulatorProcess = spawn(
  firebaseCmd,
  [
    "firebase-tools",
    "emulators:exec",
    "--project",
    "demo-classdrop",
    "--only",
    "firestore,storage",
    `"${testCmd}"`,
  ],
  {
    env,
    stdio: "inherit",
    shell: true,
  }
);

emulatorProcess.on("exit", (code) => {
  process.exit(code || 0);
});
