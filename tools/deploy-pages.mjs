import { spawnSync } from 'node:child_process';

const repository = 'erfanezk/aot';
const workflowUrl = `https://github.com/${repository}/actions/workflows/deploy.yml`;

function githubToken() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) return token;

  const credential = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: 20_000,
  });
  if (credential.status === 0) {
    const password = credential.stdout.split('\n').find((line) => line.startsWith('password='));
    if (password) return password.slice('password='.length);
  }

  throw new Error('Set GH_TOKEN or GITHUB_TOKEN to a GitHub token with Actions write access, or configure a GitHub HTTPS credential in Git.');
}

try {
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/deploy.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'aot-pages-deploy',
    },
    body: JSON.stringify({ ref: 'master' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`GitHub returned HTTP ${response.status}: ${error.message || response.statusText}`);
  }

  console.log('GitHub Pages deployment requested for the latest pushed master commit.');
  console.log(`Follow the build and deployment: ${workflowUrl}`);
  console.log('Site: https://erfanezk.github.io/aot/');
} catch (error) {
  console.error(`Deployment request failed: ${error.message}`);
  process.exitCode = 1;
}
