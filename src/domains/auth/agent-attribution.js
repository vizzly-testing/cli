import { VizzlyError } from '../../shared/vizzly-error.js';

let agents = [
  {
    slug: 'codex',
    name: 'Codex',
    matches: env => Boolean(env.CODEX_THREAD_ID || env.CODEX_SESSION_ID),
  },
  {
    slug: 'claude-code',
    name: 'Claude Code',
    matches: env => env.CLAUDECODE === '1',
  },
  { slug: 'pi', name: 'Pi', matches: env => Boolean(env.PI_SESSION_ID) },
  {
    slug: 'gemini-cli',
    name: 'Gemini CLI',
    matches: env => env.GEMINI_CLI === '1',
  },
  { slug: 'opencode', name: 'OpenCode', matches: env => env.OPENCODE === '1' },
];

function agentVia(slug) {
  if (slug === 'none') {
    throw new VizzlyError(
      'Use an agent slug. Agent attribution cannot be turned off.',
      'INVALID_AGENT_ATTRIBUTION'
    );
  }
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 48) {
    throw new VizzlyError(
      'Agent slug must be lowercase words separated by hyphens (maximum 48 characters).',
      'INVALID_AGENT_ATTRIBUTION'
    );
  }
  return {
    type: 'agent',
    slug,
    name: agents.find(agent => agent.slug === slug)?.name || slug,
    version: null,
  };
}

export function resolveAgentAttribution(options = {}, env = process.env) {
  let override = options.viaAgent || env.VIZZLY_VIA_AGENT;
  if (override) return agentVia(override);
  let matches = agents.filter(agent => agent.matches(env));
  if (matches.length > 1) {
    throw new VizzlyError(
      `Multiple agents detected: ${matches.map(agent => agent.name).join(', ')}. Use --via-agent <slug> to choose the agent.`,
      'AMBIGUOUS_AGENT_ATTRIBUTION'
    );
  }
  return matches.length ? agentVia(matches[0].slug) : null;
}

export function attributeReviewRequest(
  endpoint,
  fetchOptions,
  options = {},
  env = process.env
) {
  let path = endpoint.split('?')[0].replace(/\/+$/, '');
  let reviewWrite =
    /^\/api\/visual-review\/builds\/[^/]+(?:\/comparisons\/[^/]+|\/ocr-dynamic-content\/[^/]+)?\/decision$/.test(
      path
    );
  let commentWrite =
    /^\/api\/sdk\/builds\/[^/]+(?:\/screenshots\/[^/]+)?\/comments$/.test(path);
  if (
    fetchOptions.method?.toUpperCase() !== 'POST' ||
    (!reviewWrite && !commentWrite)
  )
    return fetchOptions;
  let via = resolveAgentAttribution(options, env);
  let body = JSON.parse(fetchOptions.body || '{}');
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new VizzlyError(
      'Review and comment requests require a JSON object.',
      'INVALID_REQUEST_BODY'
    );
  }
  let overridden = options.viaAgent || env.VIZZLY_VIA_AGENT;
  if (overridden || !Object.hasOwn(body, 'via')) {
    let { via: _previous, ...content } = body;
    body = via ? { ...content, via } : content;
  } else if (
    via &&
    (!body.via ||
      body.via.type !== via.type ||
      body.via.slug !== via.slug ||
      body.via.name !== via.name ||
      (body.via.version ?? null) !== via.version)
  ) {
    throw new VizzlyError(
      'Request via conflicts with the detected agent. Use --via-agent <slug> to choose the agent.',
      'AMBIGUOUS_AGENT_ATTRIBUTION'
    );
  }
  return { ...fetchOptions, body: JSON.stringify(body) };
}
