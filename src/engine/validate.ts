/** Every XPath the engine emits must pass this check: it matches exactly one node, the one clicked. */
export function isUniqueMatch(xpath: string, el: Element): boolean {
  const doc = el.ownerDocument;
  try {
    const r = doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return r.snapshotLength === 1 && r.snapshotItem(0) === el;
  } catch {
    return false; // an invalid expression is never a match
  }
}

/** Number of nodes an XPath matches; 0 for an invalid expression. */
export function countMatches(xpath: string, doc: Document): number {
  try {
    return doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength;
  } catch {
    return 0;
  }
}

/** 1-based position of el among the nodes an XPath matches, or -1. */
export function positionIn(xpath: string, el: Element): number {
  const doc = el.ownerDocument;
  try {
    const r = doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (let i = 0; i < r.snapshotLength; i++) {
      if (r.snapshotItem(i) === el) return i + 1;
    }
  } catch {
    /* fall through */
  }
  return -1;
}
