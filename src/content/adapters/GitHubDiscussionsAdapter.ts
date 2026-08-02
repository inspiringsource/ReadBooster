import { pairContentBlocksIntoTurns } from "../../shared/conversation";
import { READBOOSTER_SOURCE_METADATA_ATTRIBUTE } from "../../shared/contentKinds";
import {
  parseGitHubDiscussionUrl,
  type GitHubDiscussionRoute,
} from "../../shared/githubDiscussions";
import type {
  ConversationDocument,
  ConversationScanOptions,
  ConversationScanResult,
  DocumentContentBlock,
  ExtractedResponse,
} from "../../shared/types";
import { assistantBlocks, toExtractedResponse } from "../../shared/types";
import { sanitizeResponseHtml } from "../sanitize";
import type { ConversationAdapter } from "./ConversationAdapter";

const ENTRY_SELECTOR = [
  '[data-testid="discussion-post"]',
  '[data-testid="discussion-post-container"]',
  "[data-discussion-post]",
  '[data-testid="discussion-comment"]',
  '[data-testid="discussion-comment-container"]',
  "[data-discussion-comment-id]",
  "[data-comment-id]",
  '[id^="discussioncomment-"]',
  ".js-comment-container",
  ".js-discussion-comment",
  ".timeline-comment",
].join(",");

const BODY_SELECTOR = [
  '[data-testid="discussion-body"]',
  '[data-testid="discussion-post-body"]',
  '[data-testid="comment-body"]',
  ".js-comment-body",
  ".comment-body.markdown-body",
  ".markdown-body",
].join(",");

const AUTHOR_SELECTOR = [
  '[data-testid="comment-author"]',
  '[data-testid="discussion-author"]',
  "[data-author-login]",
  "a.author",
  'a[data-hovercard-type="user"]',
].join(",");

const ACCEPTED_SELECTOR = [
  '[data-testid="accepted-answer"]',
  '[data-answer-accepted="true"]',
  '[data-accepted-answer="true"]',
  '[aria-label="Accepted answer"]',
  '[aria-label*="answer selected" i]',
  '[data-testid="accepted-answer-badge"]',
].join(",");

const REPLY_CONTEXT_SELECTOR = [
  '[data-testid="discussion-reply"]',
  "[data-discussion-reply]",
  "[data-reply-to-comment-id]",
  '[data-testid="discussion-replies"]',
  "[data-discussion-replies]",
  ".js-discussion-replies",
].join(",");

const HOST_UI_SELECTOR = [
  "button",
  "form",
  "nav",
  "script",
  "style",
  "svg",
  "template",
  '[role="menu"]',
  '[role="toolbar"]',
  '[data-testid*="reaction" i]',
  '[data-testid*="menu" i]',
  '[data-testid*="actions" i]',
  '[aria-label*="reaction" i]',
  '[aria-label*="menu" i]',
].join(",");

const INACTIVE_SELECTOR = '[hidden], [aria-hidden="true"], [inert], [data-state="inactive"]';

interface DiscussionEntry {
  readonly container: HTMLElement;
  readonly body: HTMLElement;
  readonly kind: "post" | "comment" | "reply";
  readonly author: string;
  readonly timestamp: string | null;
  readonly edited: boolean;
  readonly accepted: boolean;
  readonly roleBadge: string | null;
  readonly permalink: string | null;
  readonly stableId: string | null;
  readonly replyTo: string | null;
}

function simpleHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1)
    hash = (hash * 33) ^ value.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isReadBoosterNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest("#readbooster-control-root, #readbooster-reader-root"));
}

function safeId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized &&
    normalized.length <= 512 &&
    Array.from(normalized).every((character) => character.charCodeAt(0) >= 32)
    ? normalized
    : null;
}

export class GitHubDiscussionsAdapter implements ConversationAdapter {
  readonly source = "github-discussion" as const;
  readonly displayName = "GitHub Discussions";
  readonly capabilities = {
    configured: true,
    implemented: true,
    manuallyVerified: false,
    canExtractResponses: true,
  } as const;

  constructor(
    private readonly doc: Document = document,
    private readonly hostname: string = window.location.hostname,
    private readonly currentUrl?: string,
  ) {}

  isSupportedPage(): boolean {
    return this.route() !== null;
  }

  shouldInjectControl(): boolean {
    return this.isSupportedPage() && this.hasLatestAssistantResponse();
  }

  getPageIdentity(): string | null {
    return this.route()?.conversationId ?? null;
  }

  getOptimizeControlAnchor(): HTMLElement | null {
    if (!this.isSupportedPage()) return null;
    return (
      this.doc.querySelector<HTMLElement>('[data-testid="discussion-header"]') ??
      this.doc.querySelector<HTMLElement>('[data-testid="organization-discussion-header"]') ??
      this.doc.querySelector<HTMLElement>(".gh-header") ??
      this.findTitle()?.closest<HTMLElement>("header") ??
      this.findTitle()?.parentElement ??
      null
    );
  }

  hasLatestAssistantResponse(): boolean {
    return this.getEntries().length > 0;
  }

  getConversationDocument(): ConversationDocument | null {
    const route = this.route();
    if (!route) return null;
    try {
      const extractedAt = new Date().toISOString();
      const entries = this.getEntries();
      const blocks = entries.flatMap((entry, index) => {
        const block = this.extractEntry(entry, route, index, extractedAt);
        return block ? [block] : [];
      });
      if (blocks.length === 0) return null;
      const title = this.discussionTitle(route);
      const category = this.metadataText([
        '[data-testid="discussion-category"]',
        "[data-discussion-category]",
        'a[href*="/discussions/categories/"]',
      ]);
      const status = this.metadataText([
        '[data-testid="discussion-status"]',
        "[data-discussion-status]",
        '[aria-label="Closed"]',
        '[aria-label="Answered"]',
      ]);
      const details = [
        route.kind === "repository"
          ? `${route.owner}/${route.repository}`
          : `${route.organization} organisation`,
        `Discussion #${route.discussionNumber}`,
        category,
        status,
      ].filter((value): value is string => Boolean(value));
      return {
        id: `github-discussion-${simpleHash(route.conversationId)}`,
        source: this.source,
        title,
        sourceUrl: route.canonicalUrl,
        extractedAt,
        turns: pairContentBlocksIntoTurns(blocks),
        sourceContext: {
          label: "GitHub Discussion",
          details,
          actionLabel: "Open original discussion",
          ...(this.hasIncompleteContent()
            ? {
                notice: "ReadBooster includes the discussion content currently loaded on the page.",
              }
            : {}),
        },
      };
    } catch {
      return null;
    }
  }

  getLatestAssistantResponse(): ExtractedResponse | null {
    const conversation = this.getConversationDocument();
    return conversation
      ? (assistantBlocks(conversation).map(toExtractedResponse).at(-1) ?? null)
      : null;
  }

  getAllAssistantResponses(): ExtractedResponse[] {
    const conversation = this.getConversationDocument();
    return conversation ? assistantBlocks(conversation).map(toExtractedResponse) : [];
  }

  async scanConversationDocument(
    options: ConversationScanOptions = {},
  ): Promise<ConversationScanResult> {
    const current = this.getConversationDocument();
    if (options.signal?.aborted) {
      return {
        document: current,
        scanPerformed: false,
        completed: false,
        terminationReason: "aborted",
      };
    }
    return {
      document: current,
      scanPerformed: false,
      completed: Boolean(current),
      terminationReason: current ? "single-snapshot" : "failed",
    };
  }

  observePageChanges(callback: () => void): () => void {
    const root = this.doc.body;
    if (!root) return () => undefined;
    const view = this.doc.defaultView ?? window;
    let timeoutId: number | undefined;
    const schedule = (): void => {
      view.clearTimeout(timeoutId);
      timeoutId = view.setTimeout(callback, 180);
    };
    const Observer = view.MutationObserver;
    const observer = new Observer((records) => {
      if (
        !records.every((record) =>
          [...record.addedNodes, ...record.removedNodes].every(isReadBoosterNode),
        )
      ) {
        schedule();
      }
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    for (const event of ["popstate", "hashchange", "turbo:load", "turbo:render", "pjax:end"])
      view.addEventListener(event, schedule);
    return () => {
      observer.disconnect();
      view.clearTimeout(timeoutId);
      for (const event of ["popstate", "hashchange", "turbo:load", "turbo:render", "pjax:end"])
        view.removeEventListener(event, schedule);
    };
  }

  private route(): GitHubDiscussionRoute | null {
    if (this.hostname.toLowerCase().replace(/\.$/, "") !== "github.com") return null;
    return parseGitHubDiscussionUrl(this.currentUrl ?? this.doc.location?.href ?? "");
  }

  private findRoot(): HTMLElement {
    return (
      this.doc.querySelector<HTMLElement>('[data-testid="discussion-page"]') ??
      this.doc.querySelector<HTMLElement>('[data-testid="organization-discussion-page"]') ??
      this.doc.querySelector<HTMLElement>('[data-testid="discussion-container"]') ??
      this.doc.querySelector<HTMLElement>("[data-discussion-number]") ??
      this.doc.querySelector<HTMLElement>("#discussion_bucket") ??
      this.doc.querySelector<HTMLElement>("main") ??
      this.doc.body
    );
  }

  private findTitle(): HTMLElement | null {
    const root = this.findRoot();
    return (
      root.querySelector<HTMLElement>('[data-testid="discussion-title"]') ??
      root.querySelector<HTMLElement>('[data-testid="organization-discussion-title"]') ??
      root.querySelector<HTMLElement>(".js-discussion-title") ??
      root.querySelector<HTMLElement>("h1.gh-header-title") ??
      root.querySelector<HTMLElement>("h1")
    );
  }

  private getEntries(): DiscussionEntry[] {
    if (!this.isSupportedPage()) return [];
    const root = this.findRoot();
    const bodyCandidates = Array.from(root.querySelectorAll<HTMLElement>(BODY_SELECTOR));
    const bodies = bodyCandidates.filter(
      (body) =>
        Boolean(body.closest(ENTRY_SELECTOR)) &&
        !body.closest(INACTIVE_SELECTOR) &&
        !body.closest("#readbooster-control-root, #readbooster-reader-root") &&
        !bodyCandidates.some((other) => other !== body && other.contains(body)),
    );
    const seen = new Map<string, DiscussionEntry>();
    const withoutStableId: DiscussionEntry[] = [];
    for (const [index, body] of bodies.entries()) {
      const container = body.closest<HTMLElement>(ENTRY_SELECTOR);
      if (!container) continue;
      const entry = this.describeEntry(container, body, index);
      if (!entry.stableId) withoutStableId.push(entry);
      else seen.set(entry.stableId, entry); // GitHub may briefly retain a stale duplicate during navigation.
    }
    return [...seen.values(), ...withoutStableId].sort((left, right) =>
      left.body === right.body
        ? 0
        : left.body.compareDocumentPosition(right.body) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
    );
  }

  private describeEntry(container: HTMLElement, body: HTMLElement, index: number): DiscussionEntry {
    const isPost =
      container.matches('[data-testid="discussion-post"], [data-discussion-post]') || index === 0;
    const isReply = !isPost && Boolean(container.closest(REPLY_CONTEXT_SELECTOR));
    const authorElement = container.querySelector<HTMLElement>(AUTHOR_SELECTOR);
    const author =
      normalizedText(
        authorElement?.getAttribute("data-author-login") ?? authorElement?.textContent,
      ) || "Unavailable author";
    const time = container.querySelector<HTMLElement>("relative-time[datetime], time[datetime]");
    const timestamp = normalizedText(time?.getAttribute("datetime") ?? time?.textContent) || null;
    const permalinkElement = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("a[href]"),
    ).find((link) => /\/discussions\/\d+#(?:discussioncomment-|discussion-)/.test(link.href));
    const permalink = permalinkElement?.href ?? null;
    const dataId =
      container.getAttribute("data-discussion-comment-id") ??
      container.getAttribute("data-comment-id") ??
      container.id.replace(/^discussioncomment-/, "");
    const stableId = isPost
      ? "original-post"
      : (safeId(dataId) ?? safeId(permalink?.split("#")[1]));
    const roleBadge = this.metadataText(
      ['[data-testid="author-role"]', "[data-author-association]", ".Label"],
      container,
    );
    const replyTo =
      normalizedText(
        container.getAttribute("data-reply-to-author") ??
          container.querySelector<HTMLElement>('[data-testid="reply-to-author"]')?.textContent,
      ) || null;
    return {
      container,
      body,
      kind: isPost ? "post" : isReply ? "reply" : "comment",
      author,
      timestamp,
      edited:
        Boolean(container.querySelector('[data-testid="edited-marker"], [data-edited="true"]')) ||
        /edited/i.test(
          normalizedText(container.querySelector("relative-time")?.parentElement?.textContent),
        ),
      accepted: Boolean(
        container.matches(ACCEPTED_SELECTOR) || container.querySelector(ACCEPTED_SELECTOR),
      ),
      roleBadge,
      permalink,
      stableId,
      replyTo,
    };
  }

  private extractEntry(
    entry: DiscussionEntry,
    route: GitHubDiscussionRoute,
    index: number,
    extractedAt: string,
  ): DocumentContentBlock | null {
    const staging = this.doc.createElement("div");
    const metadata = this.doc.createElement("p");
    metadata.setAttribute(READBOOSTER_SOURCE_METADATA_ATTRIBUTE, "true");
    const heading =
      entry.kind === "post" ? "Original post" : entry.kind === "reply" ? "Reply" : "Comment";
    const parts = [`${heading} by @${entry.author}`];
    if (entry.replyTo) parts.push(`Reply to @${entry.replyTo.replace(/^@/, "")}`);
    if (entry.timestamp) parts.push(entry.timestamp);
    if (entry.roleBadge) parts.push(entry.roleBadge);
    if (entry.edited) parts.push("Edited");
    const metadataTitle = this.doc.createElement("strong");
    metadataTitle.textContent = parts[0];
    metadata.append(metadataTitle);
    metadata.append(
      this.doc.createTextNode(
        parts
          .slice(1)
          .map((part) => ` · ${part}`)
          .join(""),
      ),
    );
    if (entry.permalink) {
      metadata.append(this.doc.createTextNode(" · "));
      const link = this.doc.createElement("a");
      link.href = entry.permalink;
      link.textContent = "Open comment on GitHub";
      metadata.append(link);
    }
    staging.append(metadata);
    if (entry.accepted) {
      const accepted = this.doc.createElement("p");
      accepted.setAttribute(READBOOSTER_SOURCE_METADATA_ATTRIBUTE, "true");
      const label = this.doc.createElement("strong");
      label.textContent = "Accepted answer";
      accepted.append(label);
      staging.append(accepted);
    }
    const content = entry.body.cloneNode(true) as HTMLElement;
    content
      .querySelectorAll(`[${READBOOSTER_SOURCE_METADATA_ATTRIBUTE}]`)
      .forEach((element) => element.removeAttribute(READBOOSTER_SOURCE_METADATA_ATTRIBUTE));
    content
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((input) =>
        input.replaceWith(this.doc.createTextNode(input.checked ? "[x] " : "[ ] ")),
      );
    content.querySelectorAll(HOST_UI_SELECTOR).forEach((element) => element.remove());
    staging.append(content);
    const sourceMessageId = entry.stableId;
    const id =
      sourceMessageId ??
      `entry-${index}-${simpleHash(normalizedText(content.textContent).slice(0, 256))}`;
    const { html, text } = sanitizeResponseHtml(staging, `github-${id}`, {
      preserveSourceMetadata: true,
    });
    if (!text.trim() && !/<(?:img|figure|table)\b/i.test(html)) return null;
    return {
      id,
      role: "assistant",
      html,
      text,
      sectionTitle:
        entry.kind === "post"
          ? `Original post by @${entry.author}`
          : entry.kind === "reply"
            ? `Reply by @${entry.author}${entry.replyTo ? ` to @${entry.replyTo.replace(/^@/, "")}` : ""}`
            : `Comment by @${entry.author}`,
      provenance: {
        kind: "original",
        platform: this.source,
        sourceUrl: entry.permalink ?? route.canonicalUrl,
        sourceConversationId: route.conversationId,
        ...(sourceMessageId ? { sourceMessageId } : {}),
        extractedAt,
        contentFingerprint: `djb2-${simpleHash(html + "\n" + text)}`,
      },
    };
  }

  private metadataText(
    selectors: readonly string[],
    root: ParentNode = this.findRoot(),
  ): string | null {
    for (const selector of selectors) {
      const element = root.querySelector<HTMLElement>(selector);
      const value = normalizedText(
        element?.textContent ||
          element?.getAttribute("aria-label") ||
          element?.getAttribute("data-author-association") ||
          element?.getAttribute("data-discussion-status") ||
          element?.getAttribute("data-discussion-category"),
      );
      if (value) return value;
    }
    return null;
  }

  private discussionTitle(route: GitHubDiscussionRoute): string {
    const fallback = `Discussion #${route.discussionNumber}`;
    const title = normalizedText(this.findTitle()?.textContent);
    if (!title) return fallback;
    const withoutNumber = title
      .replace(new RegExp(`\\s*#${route.discussionNumber}\\s*$`), "")
      .trim();
    return withoutNumber || fallback;
  }

  private hasIncompleteContent(): boolean {
    return Boolean(
      this.findRoot().querySelector(
        '[data-testid="load-more-comments"], [data-testid="load-more-replies"], [data-collapsed-replies], button[aria-label*="Load more" i]',
      ),
    );
  }
}
