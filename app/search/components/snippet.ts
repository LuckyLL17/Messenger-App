// Builds a short context snippet around the first keyword match and returns
// the text split into segments so the matched part can be highlighted.

export interface SnippetSegment {
  text: string;
  match: boolean;
}

const CONTEXT_RADIUS = 24;

export function buildSnippet(
  body: string | null | undefined,
  keyword: string,
): SnippetSegment[] {
  if (!body) {
    return [{ text: "", match: false }];
  }

  const trimmedKeyword = keyword.trim();

  if (!trimmedKeyword) {
    const text =
      body.length > CONTEXT_RADIUS * 2
        ? `${body.slice(0, CONTEXT_RADIUS * 2)}…`
        : body;
    return [{ text, match: false }];
  }

  const lowerBody = body.toLowerCase();
  const lowerKeyword = trimmedKeyword.toLowerCase();
  const matchIndex = lowerBody.indexOf(lowerKeyword);

  if (matchIndex === -1) {
    const text =
      body.length > CONTEXT_RADIUS * 2
        ? `${body.slice(0, CONTEXT_RADIUS * 2)}…`
        : body;
    return [{ text, match: false }];
  }

  const start = Math.max(0, matchIndex - CONTEXT_RADIUS);
  const end = Math.min(
    body.length,
    matchIndex + trimmedKeyword.length + CONTEXT_RADIUS,
  );

  const prefix = start > 0 ? "…" : "";
  const before = body.slice(start, matchIndex);
  const matchText = body.slice(
    matchIndex,
    matchIndex + trimmedKeyword.length,
  );
  const after = body.slice(matchIndex + trimmedKeyword.length, end);
  const suffix = end < body.length ? "…" : "";

  return [
    { text: prefix + before, match: false },
    { text: matchText, match: true },
    { text: after + suffix, match: false },
  ];
}
