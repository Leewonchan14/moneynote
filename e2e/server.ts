import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

export const E2E_PASSWORD = "e2e-password";
export const STANDALONE_DIR = path.resolve(import.meta.dirname, "../.next/standalone");

export const makeTempDir = (name: string) =>
  mkdtempSync(path.join(tmpdir(), `moneynote-e2e-${name}-`));

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("빈 포트를 찾지 못했어요."))
      );
    });
  });

const waitUntilReady = async (url: string, child: ChildProcess, logs: () => string) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`서버가 종료됐어요.\n${logs()}`);
    try {
      await fetch(`${url}/api/auth`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`서버가 시작되지 않았어요.\n${logs()}`);
};

export interface E2eServer {
  url: string;
  stop: () => Promise<void>;
}

/** dataDir을 쓰는 서버를 띄운다. 끌 때는 자기가 띄운 프로세스만 종료한다. */
export const startServer = async (dataDir: string): Promise<E2eServer> => {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(process.execPath, ["server.js"], {
    cwd: STANDALONE_DIR,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      MONEYNOTE_DATA_DIR: dataDir,
      SITE_PASSWORD: E2E_PASSWORD,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));

  await waitUntilReady(url, child, () => output);

  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode != null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
};

export const removeDir = (dir: string) => rmSync(dir, { recursive: true, force: true });
