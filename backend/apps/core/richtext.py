"""Plain-text extraction from Tiptap/ProseMirror JSON documents."""

BLOCK_TYPES = {
    "paragraph", "heading", "blockquote", "listItem",
    "bulletList", "orderedList", "codeBlock", "horizontalRule",
}


def extract_text(doc) -> str:
    """
    Walk a Tiptap JSON document and return its plain text. Blocks are joined
    with double newlines so word counting and FTS behave like real prose.
    Accepts anything; returns "" for non-documents.
    """
    if not isinstance(doc, dict):
        return ""

    def walk(node) -> str:
        if not isinstance(node, dict):
            return ""
        if node.get("type") == "text":
            return node.get("text", "")
        parts = []
        for child in node.get("content", []) or []:
            text = walk(child)
            if not text:
                continue
            if isinstance(child, dict) and child.get("type") in BLOCK_TYPES:
                parts.append(text.strip())
                parts.append("\n\n")
            else:
                parts.append(text)
        return "".join(parts)

    result = walk(doc)
    # Collapse >2 consecutive newlines and trim.
    lines = [chunk.strip() for chunk in result.split("\n\n")]
    return "\n\n".join(chunk for chunk in lines if chunk)
