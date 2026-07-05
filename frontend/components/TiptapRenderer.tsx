import React from "react";

/**
 * Server-side renderer for Tiptap/ProseMirror JSON documents.
 * Maps block nodes to styled React elements matching the brand.
 * Falls back gracefully: hasTiptapContent() lets callers decide
 * whether to render legacy plain text instead.
 */

interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: TiptapNode[];
}

export function hasTiptapContent(doc: unknown): doc is TiptapNode {
  const node = doc as TiptapNode | null;
  return Boolean(
    node &&
      typeof node === "object" &&
      node.type === "doc" &&
      Array.isArray(node.content) &&
      node.content.length > 0 &&
      // A single empty paragraph counts as empty.
      !(
        node.content.length === 1 &&
        node.content[0].type === "paragraph" &&
        !node.content[0].content?.length
      ),
  );
}

function renderText(node: TiptapNode, key: number): React.ReactNode {
  let element: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        element = <strong key={key}>{element}</strong>;
        break;
      case "italic":
        element = <em key={key}>{element}</em>;
        break;
      case "strike":
        element = <s key={key}>{element}</s>;
        break;
      case "code":
        element = <code key={key}>{element}</code>;
        break;
      case "link":
        element = (
          <a
            key={key}
            href={String(mark.attrs?.href ?? "#")}
            target="_blank"
            rel="noopener noreferrer"
            className="text-olive underline underline-offset-2 hover:opacity-70"
          >
            {element}
          </a>
        );
        break;
    }
  }
  return element;
}

function renderChildren(node: TiptapNode): React.ReactNode {
  return (node.content ?? []).map((child, i) => renderNode(child, i));
}

function renderNode(node: TiptapNode, key: number): React.ReactNode {
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "paragraph":
      return <p key={key}>{renderChildren(node)}</p>;
    case "heading": {
      const level = Number(node.attrs?.level ?? 2);
      if (level <= 2) {
        return (
          <h2 key={key} className="font-serif text-[26px] leading-[1.3] font-medium mt-11 mb-4 text-ink">
            {renderChildren(node)}
          </h2>
        );
      }
      return (
        <h3 key={key} className="font-serif text-[21px] leading-[1.35] font-medium mt-8 mb-3 text-ink">
          {renderChildren(node)}
        </h3>
      );
    }
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node)}</blockquote>;
    case "bulletList":
      return (
        <ul key={key} className="list-disc pl-6 mb-[26px] space-y-1.5">
          {renderChildren(node)}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key} className="list-decimal pl-6 mb-[26px] space-y-1.5">
          {renderChildren(node)}
        </ol>
      );
    case "listItem":
      return (
        <li key={key} className="[&>p]:mb-1">
          {renderChildren(node)}
        </li>
      );
    case "horizontalRule":
      return <hr key={key} className="border-0 border-t border-ink/15 my-11" />;
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img
          key={key}
          src={String(node.attrs?.src ?? "")}
          alt={String(node.attrs?.alt ?? "")}
          className="w-full rounded-sm my-9"
        />
      );
    case "hardBreak":
      return <br key={key} />;
    case "codeBlock":
      return (
        <pre key={key} className="bg-ink/5 border border-ink/10 rounded-sm p-4 text-[13px] overflow-x-auto mb-[26px]">
          <code>{renderChildren(node)}</code>
        </pre>
      );
    default:
      // Unknown node: render its children rather than dropping content.
      return <React.Fragment key={key}>{renderChildren(node)}</React.Fragment>;
  }
}

export default function TiptapRenderer({ doc }: { doc: unknown }) {
  if (!hasTiptapContent(doc)) return null;
  return <>{(doc as TiptapNode).content!.map((node, i) => renderNode(node, i))}</>;
}
