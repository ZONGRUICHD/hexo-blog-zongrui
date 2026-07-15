import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import quotaHelpers from "../lib/codex-quota.js";

const { createQuotaSnapshot } = quotaHelpers;
const __dirname = dirname(fileURLToPath(import.meta.url));
const RPC_TIMEOUT_MS = 45_000;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function codexExecutableCandidates() {
  const candidates = [process.env.CODEX_CLI_PATH];
  const extensionsDir = join(homedir(), ".vscode", "extensions");

  if (existsSync(extensionsDir)) {
    const extensions = readdirSync(extensionsDir)
      .filter((name) => name.startsWith("openai.chatgpt-"))
      .sort()
      .reverse();
    for (const extension of extensions) {
      candidates.push(
        join(extensionsDir, extension, "bin", "windows-x86_64", "codex.exe"),
      );
    }
  }

  candidates.push("codex");
  return unique(candidates);
}

function ghExecutableCandidates() {
  return unique([
    process.env.GITHUB_CLI_PATH,
    process.env.ProgramFiles
      ? join(process.env.ProgramFiles, "GitHub CLI", "gh.exe")
      : null,
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Programs", "GitHub CLI", "gh.exe")
      : null,
    "gh",
  ]);
}

function gitExecutableCandidates() {
  return unique([
    process.env.GIT_CLI_PATH,
    process.env.ProgramFiles
      ? join(process.env.ProgramFiles, "Git", "cmd", "git.exe")
      : null,
    "git",
  ]);
}

function runRateLimitRpc(executable) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["app-server", "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      finish(new Error(`Timed out reading Codex rate limits via ${executable}`));
    }, RPC_TIMEOUT_MS);

    child.on("error", (error) => finish(error));
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("exit", (code) => {
      if (!settled) {
        finish(
          new Error(
            `Codex app server exited before returning rate limits (${code}): ${stderr}`,
          ),
        );
      }
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      let newline;
      while ((newline = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (!line) continue;

        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }

        if (message.id === 1) {
          if (message.error) {
            finish(new Error(message.error.message || "Codex initialization failed"));
          } else if (message.result) {
            child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
            child.stdin.write(
              `${JSON.stringify({ id: 2, method: "account/rateLimits/read", params: null })}\n`,
            );
          }
        } else if (message.id === 2) {
          if (message.error) {
            finish(new Error(message.error.message || "Codex rate-limit request failed"));
          } else {
            finish(null, message.result);
          }
        }
      }
    });

    child.stdin.write(
      `${JSON.stringify({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "zongtech-quota-publisher", version: "1.0" },
          capabilities: {},
        },
      })}\n`,
    );
  });
}

export async function readLiveQuotaSnapshot() {
  const errors = [];
  for (const executable of codexExecutableCandidates()) {
    if (executable.includes("\\") && !existsSync(executable)) continue;
    try {
      const response = await runRateLimitRpc(executable);
      return createQuotaSnapshot(response);
    } catch (error) {
      errors.push(`${executable}: ${error.message}`);
    }
  }
  throw new Error(`Unable to read Codex weekly quota. ${errors.join(" | ")}`);
}

function runGit(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Git failed (${code}): ${stderr}`));
    });
    child.stdin.end(options.input || "");
  });
}

async function forcePushGist(executable, gistId, snapshot) {
  const gitDir =
    process.env.CODEX_QUOTA_GIT_DIR ||
    join(process.env.LOCALAPPDATA || homedir(), "ZongTech", "codex-quota-gist.git");
  if (!existsSync(gitDir)) {
    mkdirSync(dirname(gitDir), { recursive: true });
    await runGit(executable, ["init", "--bare", gitDir]);
  }

  const content = `${JSON.stringify(snapshot, null, 2)}\n`;
  const blob = await runGit(executable, ["hash-object", "-w", "--stdin"], {
    cwd: gitDir,
    input: content,
  });
  const tree = await runGit(executable, ["mktree"], {
    cwd: gitDir,
    input: `100644 blob ${blob}\tcodex-quota.json\n`,
  });
  const identity = {
    GIT_AUTHOR_NAME: "ZongTech Quota Publisher",
    GIT_AUTHOR_EMAIL: "98888228+ZONGRUICHD@users.noreply.github.com",
    GIT_COMMITTER_NAME: "ZongTech Quota Publisher",
    GIT_COMMITTER_EMAIL: "98888228+ZONGRUICHD@users.noreply.github.com",
  };
  const commit = await runGit(
    executable,
    ["commit-tree", tree, "-m", "Update sanitized Codex quota snapshot"],
    { cwd: gitDir, env: identity },
  );
  await runGit(
    executable,
    [
      "push",
      "--force",
      `https://gist.github.com/${gistId}.git`,
      `${commit}:refs/heads/main`,
    ],
    { cwd: gitDir },
  );
  await runGit(executable, ["prune", "--expire", "now"], { cwd: gitDir });
}

function createGist(executable, snapshot) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      ["api", "--method", "POST", "/gists", "--input", "-"],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`GitHub CLI failed (${code}): ${stderr}`));
        return;
      }
      try {
        const response = JSON.parse(stdout);
        resolve({ id: response.id, url: response.html_url });
      } catch (error) {
        reject(new Error(`GitHub returned an invalid Gist response: ${error.message}`));
      }
    });
    child.stdin.end(
      JSON.stringify({
        description: "Live, sanitized Codex weekly quota for zongtech.xyz",
        public: true,
        files: {
          "codex-quota.json": {
            content: `${JSON.stringify(snapshot, null, 2)}\n`,
          },
        },
      }),
    );
  });
}

export async function publishSnapshotToGist(gistId, snapshot) {
  const errors = [];
  for (const executable of gitExecutableCandidates()) {
    if (executable.includes("\\") && !existsSync(executable)) continue;
    try {
      await forcePushGist(executable, gistId, snapshot);
      return;
    } catch (error) {
      errors.push(`${executable}: ${error.message}`);
    }
  }
  throw new Error(`Unable to publish quota snapshot. ${errors.join(" | ")}`);
}

export async function publishSnapshotToNewGist(snapshot) {
  const errors = [];
  for (const executable of ghExecutableCandidates()) {
    if (executable.includes("\\") && !existsSync(executable)) continue;
    try {
      return await createGist(executable, snapshot);
    } catch (error) {
      errors.push(`${executable}: ${error.message}`);
    }
  }
  throw new Error(`Unable to create quota Gist. ${errors.join(" | ")}`);
}

function parseArguments(argv) {
  const args = {
    createGist: false,
    dryRun: false,
    gistId: process.env.CODEX_QUOTA_GIST_ID || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") args.dryRun = true;
    else if (argv[index] === "--create-gist") args.createGist = true;
    else if (argv[index] === "--gist-id") args.gistId = argv[++index] || "";
    else if (argv[index] === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  if (args.help) {
    console.log(
      "Usage: node tools/publish-codex-quota.mjs [--dry-run | --create-gist | --gist-id <id>]",
    );
    return;
  }

  const snapshot = await readLiveQuotaSnapshot();
  if (args.dryRun) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  if (args.createGist) {
    const gist = await publishSnapshotToNewGist(snapshot);
    console.log(`Created quota Gist ${gist.id}: ${gist.url}`);
    return;
  }
  if (!args.gistId) {
    throw new Error("Pass --gist-id or set CODEX_QUOTA_GIST_ID");
  }

  await publishSnapshotToGist(args.gistId, snapshot);
  console.log(
    `Published Codex weekly quota: ${snapshot.remainingPercent}% remaining (${snapshot.observedAt})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
