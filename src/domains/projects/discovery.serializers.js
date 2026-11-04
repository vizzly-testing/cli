export function serializeProject(project) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    organizationName: project.organizationName,
    organizationSlug: project.organizationSlug,
    buildCount: project.buildCount,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

export function serializeOrganization(org) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    role: org.role,
    projectCount: org.projectCount,
    createdAt: org.created_at,
  };
}
