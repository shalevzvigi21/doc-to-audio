/**
 * Strip non-narrative content from OCR-extracted text before TTS synthesis.
 *
 * Targets content that interrupts fluid listening:
 *   - Inline numeric citations  [1], [1,2], [1–3]
 *   - The entire References / Bibliography section
 *   - Bare page numbers on their own line
 *   - URLs and DOIs
 */

// Headings that mark the start of the references section (case-insensitive).
const REFERENCE_HEADINGS = [
  "references",
  "bibliography",
  "works cited",
  "literature",
  "sources",
  "מקורות",
  "ביבליוגרפיה",
  "רשימת מקורות",
];

/**
 * Build a regex that matches a line whose trimmed content is one of the
 * reference heading strings, allowing trailing punctuation and numbering.
 * e.g. "References", "6. References", "BIBLIOGRAPHY:"
 */
const REFERENCE_HEADING_RE = new RegExp(
  `^(?:\\d+\\.?\\s*)?(?:${REFERENCE_HEADINGS.join("|")})[:\\s]*$`,
  "im",
);

/** Numeric inline citations: [1], [1,2], [1, 2, 3], [1-3], [1–3] */
const NUMERIC_CITATION_RE = /\[\d+(?:\s*[,\-–]\s*\d+)*\]/g;

/** A line whose only content is digits (page number artefact from PDF). */
const PAGE_NUMBER_LINE_RE = /^\s*-?\s*\d{1,4}\s*-?\s*$/gm;

/** URLs and DOIs — not readable aloud. */
const URL_RE = /(?:https?:\/\/|www\.)\S+/g;
const DOI_RE = /\bdoi:\s*10\.\d{4,}\/\S+/gi;

export function cleanTextForReading(raw: string): string {
  let text = raw;

  // 1. Cut everything from the References heading to end of document.
  const refMatch = REFERENCE_HEADING_RE.exec(text);
  if (refMatch) {
    text = text.slice(0, refMatch.index).trimEnd();
  }

  // 2. Remove inline numeric citations.
  text = text.replace(NUMERIC_CITATION_RE, "");

  // 3. Remove URLs and DOIs.
  text = text.replace(URL_RE, "").replace(DOI_RE, "");

  // 4. Remove bare page-number lines.
  text = text.replace(PAGE_NUMBER_LINE_RE, "");

  // 5. Collapse runs of blank lines left by removals into a single blank line.
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
