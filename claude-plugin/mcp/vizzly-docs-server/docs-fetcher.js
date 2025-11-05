/**
 * Fetches documentation from docs.vizzly.dev
 */

let BASE_URL = 'https://docs.vizzly.dev';
let INDEX_URL = `${BASE_URL}/api/mcp-index.json`;

/**
 * Fetch the documentation index
 */
export async function fetchDocsIndex() {
  try {
    let response = await fetch(INDEX_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch docs index: ${response.status} ${response.statusText}`);
    }

    let index = await response.json();
    return index;
  } catch (error) {
    throw new Error(`Failed to load documentation index: ${error.message}`);
  }
}

/**
 * Fetch the content of a specific document
 */
export async function fetchDocContent(path) {
  // Normalize path (remove leading slash, ensure it doesn't end with .md/.mdx)
  let cleanPath = path.replace(/^\//, '').replace(/\.(mdx?|md)$/, '');

  let contentUrl = `${BASE_URL}/api/content/${cleanPath}`;

  try {
    let response = await fetch(contentUrl);

    if (!response.ok) {
      // Try with .mdx extension if not found
      if (response.status === 404 && !path.endsWith('.mdx')) {
        contentUrl = `${BASE_URL}/api/content/${cleanPath}.mdx`;
        response = await fetch(contentUrl);
      }

      if (!response.ok) {
        throw new Error(`Document not found: ${path} (${response.status})`);
      }
    }

    let content = await response.text();
    return content;
  } catch (error) {
    throw new Error(`Failed to fetch document content: ${error.message}`);
  }
}

/**
 * Search documents by query
 * Simple client-side search through titles and descriptions
 */
export function searchDocs(docs, query, limit = 10) {
  let lowerQuery = query.toLowerCase();
  let terms = lowerQuery.split(/\s+/);

  let results = docs
    .map(doc => {
      let titleLower = doc.title.toLowerCase();
      let descLower = (doc.description || '').toLowerCase();
      let categoryLower = doc.category.toLowerCase();

      let score = 0;

      // Exact phrase match in title (highest score)
      if (titleLower.includes(lowerQuery)) {
        score += 10;
      }

      // Exact phrase match in description
      if (descLower.includes(lowerQuery)) {
        score += 5;
      }

      // Exact phrase match in category
      if (categoryLower.includes(lowerQuery)) {
        score += 3;
      }

      // Individual term matches
      for (let term of terms) {
        if (titleLower.includes(term)) score += 3;
        if (descLower.includes(term)) score += 1;
        if (categoryLower.includes(term)) score += 0.5;
      }

      return { doc, score };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Normalize scores to 0-1 range
  if (results.length > 0) {
    let maxScore = results[0].score;
    for (let result of results) {
      result.score = result.score / maxScore;
    }
  }

  return results;
}
