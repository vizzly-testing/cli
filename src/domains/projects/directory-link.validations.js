import { z } from 'zod';
import { VizzlyError } from '../../shared/vizzly-error.js';

export let DIRECTORY_PROJECT_LINK_FILENAME = 'vizzly.project.json';
export let MAX_DIRECTORY_PROJECT_LINK_BYTES = 16 * 1024;

export function validateProjectApiOrigin(value) {
  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new VizzlyError(
      'The project API origin must be an HTTP or HTTPS origin.',
      'PROJECT_LINK_INVALID'
    );
  }
  if (
    typeof value !== 'string' ||
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/' ||
    ![origin.origin, `${origin.origin}/`].includes(value)
  ) {
    throw new VizzlyError(
      'The project API origin must contain only its protocol, hostname, and optional port.',
      'PROJECT_LINK_INVALID'
    );
  }
  return origin.origin;
}

export function isProjectId(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

let bindingSchema = z
  .object({
    version: z.literal(1),
    apiOrigin: z.string(),
    projectId: z.string().refine(isProjectId),
  })
  .strict();

export function validateDirectoryProjectLink(value) {
  let parsed = bindingSchema.safeParse(value);
  if (!parsed.success) {
    throw new VizzlyError(
      'vizzly.project.json must contain only version: 1, apiOrigin, and a projectId UUID.',
      'PROJECT_LINK_INVALID'
    );
  }
  return {
    ...parsed.data,
    apiOrigin: validateProjectApiOrigin(parsed.data.apiOrigin),
    projectId: parsed.data.projectId.toLowerCase(),
  };
}
