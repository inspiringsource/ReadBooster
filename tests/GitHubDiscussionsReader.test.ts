import { readFileSync } from "node:fs";

import { act, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GitHubDiscussionsAdapter } from "../src/content/adapters/GitHubDiscussionsAdapter";
import { mergeConversationDocuments } from "../src/shared/conversation";
import { stickerConversationIdentity } from "../src/shared/stickers";
import { highlightConversationIdentity } from "../src/shared/highlights";
import { sectionTitleOverrideIdentity } from "../src/shared/sectionTitleOverrides";
import { assignHighlightBlockIds } from "../src/reader/highlights/highlightAnchoring";
import { deriveConversationSections } from "../src/reader/presentation";
import { createPrintStudioDocument } from "../src/reader/printStudio/printStudioModel";
import { discoverReadingBlocks } from "../src/reader/guidedReading/readingBlocks";
import { mountReader, READER_HOST_ID } from "../src/reader/mountReader";

const FIXTURE = readFileSync("tests/fixtures/github-discussion.html", "utf8");
const ORGANIZATION_FIXTURE = readFileSync(
  "tests/fixtures/github-organization-discussion.html",
  "utf8",
);

function extract(html = FIXTURE) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return new GitHubDiscussionsAdapter(
    document,
    "github.com",
    "https://github.com/example/reader/discussions/42",
  ).getConversationDocument()!;
}

describe("GitHub Discussions shared Reader model", () => {
  it("renders source context through Document, Focus, technical blocks, and Print Studio", async () => {
    await act(async () => mountReader(extract()));
    const shadow = document.getElementById(READER_HOST_ID)!.shadowRoot!;
    expect(shadow.querySelector(".rb-source-context")?.textContent).toContain(
      "example/reader · Discussion #42 · Ideas · Answered",
    );
    expect(
      shadow.querySelector<HTMLAnchorElement>(".rb-source-context a")?.getAttribute("href"),
    ).toBe("https://github.com/example/reader/discussions/42");
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(5);
    expect(shadow.querySelectorAll(".rb-code-block")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-table-block")).toHaveLength(1);
    expect(shadow.textContent).toContain("Accepted answer");

    const findButton = (label: string) =>
      Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.textContent === label,
      )!;
    fireEvent.click(findButton("Focus"));
    expect(shadow.querySelector(".rb-response-position")?.textContent).toBe("Entry 5 of 5");
    fireEvent.click(shadow.querySelector('[aria-label="Show previous discussion entry"]')!);
    expect(shadow.querySelector(".rb-response-position")?.textContent).toBe("Entry 4 of 5");

    fireEvent.click(findButton("Actions"));
    fireEvent.click(findButton("Print Studio"));
    expect(shadow.querySelector(".rb-print-studio")?.textContent).toContain("Discussion #42");
    expect(shadow.querySelector(".rb-print-studio")?.textContent).toContain(
      "https://github.com/example/reader/discussions/42",
    );
  });

  it("creates one Focus/Document section per entry with stable local annotation identity", () => {
    const conversation = extract();
    const sections = deriveConversationSections(conversation);
    expect(sections).toHaveLength(5);
    expect(sections.map((section) => section.title)).toEqual([
      "Original post by @maintainer",
      "Comment by @reviewer",
      "Reply by @helper to @reviewer",
      "Comment by @answerer",
      "Comment by @Unavailable author",
    ]);
    expect(stickerConversationIdentity(conversation)).toEqual({
      conversationKey: "github-discussion:repo:example/reader#42",
      persistable: true,
      persistence: "stable",
    });
  });

  it("keeps repository and organisation annotations in separate stable namespaces", () => {
    const organizationDocument = new DOMParser().parseFromString(ORGANIZATION_FIXTURE, "text/html");
    const organizationConversation = new GitHubDiscussionsAdapter(
      organizationDocument,
      "github.com",
      "https://github.com/orgs/community/discussions/203678",
    ).getConversationDocument()!;
    expect(stickerConversationIdentity(organizationConversation)).toEqual({
      conversationKey: "github-discussion:org:community#203678",
      persistable: true,
      persistence: "stable",
    });
    expect(stickerConversationIdentity(organizationConversation).conversationKey).not.toBe(
      stickerConversationIdentity(extract()).conversationKey,
    );
    expect(highlightConversationIdentity(organizationConversation).conversationKey).toBe(
      "github-discussion:org:community#203678",
    );
    const sections = deriveConversationSections(organizationConversation);
    expect(sections).toHaveLength(4);
    expect(
      sectionTitleOverrideIdentity(organizationConversation, sections[0].response),
    ).toMatchObject({
      conversationKey: "github-discussion:org:community#203678",
      responseKey: "github-discussion:original-post",
      persistable: true,
    });
    document.body.innerHTML = sections
      .map(
        (section) =>
          `<section data-rb-section-id="${section.id}"><div class="rb-content rb-content--document" data-rb-response-id="${section.response.id}">${section.response.html}</div></section>`,
      )
      .join("");
    expect(discoverReadingBlocks(document.body).map((block) => block.kind)).toEqual(
      expect.arrayContaining(["heading", "paragraph", "list", "code", "table", "image"]),
    );
    const printDocument = createPrintStudioDocument(
      organizationConversation,
      organizationConversation.title!,
      sections,
      new Map(),
      new Map(),
    );
    expect(printDocument.sourceUrl).toBe("https://github.com/orgs/community/discussions/203678");
    expect(printDocument.sections).toHaveLength(4);
  });

  it("renders an organisation Discussion through Document and Focus views", async () => {
    const organizationDocument = new DOMParser().parseFromString(ORGANIZATION_FIXTURE, "text/html");
    const conversation = new GitHubDiscussionsAdapter(
      organizationDocument,
      "github.com",
      "https://github.com/orgs/community/discussions/203678",
    ).getConversationDocument()!;
    await act(async () => mountReader(conversation));
    const shadow = document.getElementById(READER_HOST_ID)!.shadowRoot!;
    expect(shadow.querySelector(".rb-source-context")?.textContent).toContain(
      "community organisation · Discussion #203678 · Discussions · Answered",
    );
    expect(shadow.querySelectorAll(".rb-document-section")).toHaveLength(4);
    expect(shadow.querySelectorAll(".rb-code-block")).toHaveLength(1);
    expect(shadow.querySelectorAll(".rb-table-block")).toHaveLength(1);
    const focus = Array.from(shadow.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Focus",
    )!;
    fireEvent.click(focus);
    expect(shadow.querySelector(".rb-response-position")?.textContent).toBe("Entry 4 of 4");
  });

  it("keeps source metadata outside Guided Reading passages and highlight anchors", () => {
    const conversation = extract();
    const section = deriveConversationSections(conversation)[0];
    document.body.innerHTML = `<section data-rb-section-id="${section.id}" data-rb-response-id="${section.response.id}"><div class="rb-content rb-content--document" data-rb-response-id="${section.response.id}">${section.response.html}</div></section>`;
    const readingBlocks = discoverReadingBlocks(document.body);
    expect(
      readingBlocks.some((block) => block.element.hasAttribute("data-readbooster-source-meta")),
    ).toBe(false);
    expect(readingBlocks.some((block) => block.kind === "code")).toBe(true);
    expect(readingBlocks.some((block) => block.kind === "table")).toBe(true);
    expect(
      assignHighlightBlockIds(document.body).some((block) =>
        block.hasAttribute("data-readbooster-source-meta"),
      ),
    ).toBe(false);
  });

  it("feeds source context and all entries into the existing Print Studio model", () => {
    const conversation = extract();
    const sections = deriveConversationSections(conversation);
    const printDocument = createPrintStudioDocument(
      conversation,
      conversation.title!,
      sections,
      new Map(),
      new Map(),
    );
    expect(printDocument.source).toBe("github-discussion");
    expect(printDocument.sourceUrl).toBe("https://github.com/example/reader/discussions/42");
    expect(printDocument.sourceContext?.details).toContain("Discussion #42");
    expect(printDocument.sections).toHaveLength(5);
  });

  it("updates a stable edited comment even when the replacement text is shorter", () => {
    const existing = extract();
    const changed = FIXTURE.replace(
      "Use semantic attributes before class fallbacks.",
      "Short update.",
    );
    const incoming = extract(changed);
    const merged = mergeConversationDocuments(existing, incoming);
    expect(deriveConversationSections(merged)[1].response.text).toContain("Short update.");
    expect(deriveConversationSections(merged)[1].response.text).not.toContain(
      "semantic attributes",
    );
  });
});
