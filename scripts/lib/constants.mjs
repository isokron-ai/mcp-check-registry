// Values shared by every script. Change pins here only.

/** This repository, where submissions arrive and entries live. */
export const REGISTRY_REPO = 'isokron-ai/mcp-check-registry';

/** Listing pages on the site (contract C3). */
export const LISTING_BASE = 'https://isokron.ai/mcp-check/registry';
export const CHECKS_BASE = 'https://isokron.ai/mcp-check/checks';
export const SITE_HOME = 'https://isokron.ai/mcp-check';

/**
 * Channel tags on links to isokron.ai (isokron-site docs/LINK-TAGS.md: exactly two keys).
 * BOT: the submission reply and the entry pull request. README: this repository's docs and forms.
 */
export const UTM_BOT = { utm_source: 'mcp-check-registry-bot', utm_medium: 'action' };
export const UTM_README = { utm_source: 'mcp-check-registry-readme', utm_medium: 'readme' };

/**
 * Action pins for the one-click workflow (contract C1).
 * TODO(release 1.1.0): pin isokron-ai/mcp-check to the release commit SHA with a "# v1.1.0" comment,
 * as the site does. Until then the major tag is used. v1 currently points at 1.0.0, which has no
 * zero-config source reading; the link only works once 1.1.0 moves v1.
 */
export const PINS = {
  checkout: { ref: '3d3c42e5aac5ba805825da76410c181273ba90b1', label: 'v7.0.1' },
  mcpCheck: { ref: 'v1', label: null },
};

export const WORKFLOW_PATH = '.github/workflows/mcp-check.yml';
export const CLAIM_PATH = '.github/mcp-check/registry.json';

/** Marker that identifies the bot's own submission comment, so it is updated in place. */
export const COMMENT_MARKER = '<!-- mcp-check-registry:submission -->';

/** Issue form label; the submission workflow only acts on issues that carry it. */
export const SUBMISSION_LABEL = 'submission';

export const SECTIONS = ['spec', 'anthropic', 'openai', 'security', 'quality', 'surface'];
export const SECTION_LABELS = {
  spec: 'MCP specification',
  anthropic: 'Claude directory rules',
  openai: 'ChatGPT directory rules',
  security: 'Poisoning and hidden text',
  quality: 'Schema and description quality',
  surface: 'Write-surface design',
};

/** The checker's severities, mapped to the registry's three levels. */
export const SEVERITY_MAP = { blocking: 'high', attention: 'medium', advice: 'low' };
