import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

const PORT = Number(process.env.PORT || 3001);
const MODEL = (process.env.OPENAI_MODEL || 'gpt-5.6-luna').trim();
const API_KEY = (process.env.OPENAI_API_KEY || '').trim();

const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim();
const GITHUB_OWNER = (process.env.GITHUB_OWNER || '').trim();
const GITHUB_REPO = (process.env.GITHUB_REPO || '').trim();
const GITHUB_BRANCH = (process.env.GITHUB_BRANCH || 'main').trim();

const openai = API_KEY ? new OpenAI({ apiKey: API_KEY }) : null;

const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const publicDir = __dirname;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(publicDir));

const SYSTEM_PROMPT = `
You are Master KOM AI, the user's AI Business Manager.

Your goal is to ACTUALLY DO WORK, not merely explain how to do it.

You have access to GitHub tools connected to the user's configured repository.
Use those tools whenever the user asks you to inspect, create, modify, improve, repair,
upgrade, or build project files.

IMPORTANT RULES:

1. Before changing an existing file, read it first.
2. Understand the existing project before making changes.
3. Make targeted changes and preserve existing business information unless the user
   explicitly asks to change it.
4. Never claim that a file was changed unless the GitHub write tool actually succeeded.
5. Never claim that a website was deployed unless a real deployment tool confirms it.
6. Never claim that a social-media post was published unless a real social-media tool
   confirms publication.
7. Do not expose API keys, GitHub tokens, passwords, or secrets.
8. Do not put secrets into repository files.
9. Do not delete important files unless the user explicitly asks for deletion.
10. If a task can be completed using the connected GitHub repository, perform the work
    instead of only giving instructions.
11. For website work, inspect the relevant HTML/CSS/JS files before editing them.
12. Keep designs premium, responsive, mobile-friendly and production-oriented when
    the user asks for website improvements.
13. If the user asks to add an image but no real image-generation/storage tool is
    connected, do not pretend that an image was created or uploaded.
14. Social-media management will use official platform APIs and permissions when
    those tools are connected.
15. Be concise and practical. Speak naturally in Hinglish when the user speaks Hinglish.

The connected GitHub repository is the user's project repository.
`;

function githubConfigured() {
  return Boolean(
    GITHUB_TOKEN &&
    GITHUB_OWNER &&
    GITHUB_REPO &&
    GITHUB_BRANCH
  );
}

async function githubRequest(endpoint, options = {}) {
  if (!githubConfigured()) {
    throw new Error('GitHub integration is not configured in Render environment variables.');
  }

  const response = await fetch(`https://api.github.com${endpoint}`, {
  ...options,
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2026-03-10',
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }
});

  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
  throw new Error("GitHub API " + response.status + ": " + (data?.message || text || "Request failed."));
  }

  return data;
}

function safeRepoPath(filePath) {
  const clean = String(filePath || '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');

  if (
    !clean ||
    clean.includes('..') ||
    clean.startsWith('.git/')
  ) {
    throw new Error('Invalid repository path.');
  }

  return clean;
}

async function githubGetFile(filePath) {
  const cleanPath = safeRepoPath(filePath);

  const data = await githubRequest(
    /repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/contents/${cleanPath}?ref=${encodeURIComponent(GITHUB_BRANCH)}
  );

  if (Array.isArray(data)) {
    return {
      type: 'directory',
      path: cleanPath,
      items: data.map(item => ({
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size
      }))
    };
  }

  if (data.type !== 'file') {
    return {
      type: data.type || 'unknown',
      path: cleanPath,
      message: 'This path is not a normal file.'
    };
  }

  const content = Buffer.from(
    String(data.content || '').replace(/\n/g, ''),
    'base64'
  ).toString('utf8');

  return {
    type: 'file',
    path: cleanPath,
    sha: data.sha,
    size: data.size,
    content
  };
}

async function githubListDirectory(directoryPath = '') {
  const cleanPath = String(directoryPath || '').replace(/^\/+/, '').replace(/\\/g, '/');

  if (cleanPath.includes('..')) {
    throw new Error('Invalid directory path.');
  }

  const suffix = cleanPath
    ? /${cleanPath}
    : '';

  const data = await githubRequest(
    /repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/contents${suffix}?ref=${encodeURIComponent(GITHUB_BRANCH)}
  );

  if (!Array.isArray(data)) {
    throw new Error('Requested path is not a directory.');
  }

  return data.map(item => ({
    name: item.name,
    path: item.path,
    type: item.type,
    size: item.size
  }));
}

async function githubWriteFile(filePath, content, commitMessage, sha = null) {
  const cleanPath = safeRepoPath(filePath);

  const body = {
    message: String(commitMessage || KOM AI update: ${cleanPath}),
    content: Buffer.from(String(content), 'utf8').toString('base64'),
    branch: GITHUB_BRANCH
  };

  if (sha) {
    body.sha = sha;
  }

  const data = await githubRequest(
    /repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/contents/${cleanPath},
    {
      method: 'PUT',
      body: JSON.stringify(body)
    }
  );

  return {
    success: true,
    path: cleanPath,
    commitSha: data?.commit?.sha || null,
    fileSha: data?.content?.sha || null,
    url: data?.content?.html_url || null
  };
}

const tools = [
  {
    type: 'function',
    name: 'github_list_directory',
    description:
      'List files and folders in the connected GitHub repository. Use this to understand the project structure.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path inside the repository. Use empty string for repository root.'
        }
      },
      required: ['path'],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: 'function',
    name: 'github_get_file',
    description:
      'Read the complete contents of a file or inspect a directory in the connected GitHub repository.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path of the file or directory inside the repository.'
        }
      },
      required: ['path'],
      additionalProperties: false
    },
    strict: true
  },
  {
    type: 'function',
    name: 'github_write_file',
    description:
      'Create or update a file in the connected GitHub repository. Use github_get_file first when updating an existing file so the current SHA is known.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path of the file inside the repository.'
        },
        content: {
          type: 'string',
          description: 'Complete new content of the file.'
        },
        commit_message: {
          type: 'string',
          description: 'Short meaningful Git commit message.'
        },
        sha: {
          type: ['string', 'null'],
          description: 'Current GitHub file SHA when updating an existing file; null when creating a new file.'
        }
      },
      required: ['path', 'content', 'commit_message', 'sha'],
      additionalProperties: false
    },
    strict: true
  }
];

async function executeTool(name, args) {
  if (name === 'github_list_directory') {
    return await githubListDirectory(args.path);
  }

  if (name === 'github_get_file') {
    return await githubGetFile(args.path);
  }

  if (name === 'github_write_file') {
    return await githubWriteFile(
      args.path,
      args.content,
      args.commit_message,
      args.sha
    );
  }

  throw new Error(Unknown tool: ${name});
}

async function runAgent(message) {
  let input = [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    },
    {
      role: 'user',
      content: message
    }
  ];

  for (let round = 0; round < 8; round++) {
    const response = await openai.responses.create({
      model: MODEL,
      input,
      tools
    });

    const functionCalls = (response.output || []).filter(
      item => item.type === 'function_call'
    );

    if (functionCalls.length === 0) {
      return response.output_text || 'No text response returned.';
    }

    input.push(...response.output);

    for (const call of functionCalls) {
      let result;

      try {
        const args = JSON.parse(call.arguments || '{}');
        result = await executeTool(call.name, args);
      } catch (error) {
        result = {
          success: false,
          error: error?.message || 'Tool execution failed.'
        };
      }

      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }
  }

  return 'KOM AI stopped after reaching the maximum tool-operation limit.';
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '0.4.0-GITHUB-AI',
    mode: openai ? 'AI' : 'NO_KEY',
    model: openai ? MODEL : null,
    keyLoaded: Boolean(API_KEY),
    githubConfigured: githubConfigured(),
    githubRepository: githubConfigured()
      ? ${GITHUB_OWNER}/${GITHUB_REPO}:${GITHUB_BRANCH}
      : null
  });
});

app.post('/api/agent/run', async (req, res) => {
  const message = String(req.body?.message || '').trim();

  if (!message) {
    return res.status(400).json({
      ok: false,
      error: 'Message is required.'
    });
  }

  if (!openai) {
    return res.status(503).json({
      ok: false,
      mode: 'NO_KEY',
      error: 'OPENAI_API_KEY is not loaded.'
    });
  }

  try {
    const reply = await runAgent(message);

    res.json({
      ok: true,
      mode: 'AI',
      model: MODEL,
      github: githubConfigured(),
      reply
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      mode: 'AI_ERROR',
      error: error?.message || 'KOM AI request failed.'
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(KOM AI CLOUD running on port ${PORT});
  console.log(API key loaded: ${Boolean(API_KEY)});
  console.log(GitHub configured: ${githubConfigured()});
  console.log(
    `GitHub repo: ${
      githubConfigured()
        ? ${GITHUB_OWNER}/${GITHUB_REPO}:${GITHUB_BRANCH}
        : 'NOT CONFIGURED'
    }`
  );
  console.log(Model: ${MODEL});
});
