interface GitHubDiscussionRouteBase {
  readonly discussionNumber: number;
  readonly conversationId: string;
  readonly canonicalUrl: string;
}

export interface GitHubRepositoryDiscussionRoute extends GitHubDiscussionRouteBase {
  readonly kind: "repository";
  readonly owner: string;
  readonly repository: string;
}

export interface GitHubOrganizationDiscussionRoute extends GitHubDiscussionRouteBase {
  readonly kind: "organization";
  readonly organization: string;
}

export type GitHubDiscussionRoute =
  GitHubRepositoryDiscussionRoute | GitHubOrganizationDiscussionRoute;

const RESERVED_OWNER_SEGMENTS = new Set([
  "about",
  "account",
  "apps",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "search",
  "settings",
  "signup",
  "site",
  "sponsors",
  "topics",
  "trending",
  "users",
]);

function decodedSegment(value: string): string | null {
  const decoded = decodeURIComponent(value).trim();
  return decoded && !decoded.includes("/") ? decoded : null;
}

/** Matches one repository- or organisation-owned GitHub Discussion and rejects list pages. */
export function parseGitHubDiscussionUrl(value: string | URL): GitHubDiscussionRoute | null {
  try {
    const url = value instanceof URL ? value : new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;

    const organizationMatch = url.pathname.match(/^\/orgs\/([^/]+)\/discussions\/([1-9]\d*)\/?$/);
    if (organizationMatch) {
      const organization = decodedSegment(organizationMatch[1]);
      const discussionNumber = Number(organizationMatch[2]);
      if (!organization || !Number.isSafeInteger(discussionNumber)) return null;
      return {
        kind: "organization",
        organization,
        discussionNumber,
        conversationId: `org:${organization}#${discussionNumber}`,
        canonicalUrl: `https://github.com/orgs/${encodeURIComponent(organization)}/discussions/${discussionNumber}`,
      };
    }

    const repositoryMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)\/discussions\/([1-9]\d*)\/?$/);
    if (!repositoryMatch) return null;
    const owner = decodedSegment(repositoryMatch[1]);
    const repository = decodedSegment(repositoryMatch[2]);
    if (!owner || !repository || RESERVED_OWNER_SEGMENTS.has(owner.toLowerCase())) return null;
    const discussionNumber = Number(repositoryMatch[3]);
    if (!Number.isSafeInteger(discussionNumber)) return null;
    return {
      kind: "repository",
      owner,
      repository,
      discussionNumber,
      conversationId: `repo:${owner}/${repository}#${discussionNumber}`,
      canonicalUrl: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/discussions/${discussionNumber}`,
    };
  } catch {
    return null;
  }
}
