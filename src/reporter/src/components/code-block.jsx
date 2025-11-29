import { useEffect, useRef } from 'react';

// Simple tokenizer for different languages
function tokenize(code, language) {
  let tokens = [];

  if (language === 'shell') {
    code.split('\n').forEach((line, lineNum) => {
      let lineStart =
        code.split('\n').slice(0, lineNum).join('\n').length +
        (lineNum > 0 ? 1 : 0);

      if (line.trim().startsWith('#')) {
        tokens.push({
          type: 'comment',
          start: lineStart,
          end: lineStart + line.length,
        });
      } else if (
        line.trim().startsWith('npm') ||
        line.trim().startsWith('npx')
      ) {
        tokens.push({
          type: 'command',
          start: lineStart,
          end: lineStart + line.length,
        });
      }
    });
    return tokens;
  }

  // JavaScript/TypeScript
  let patterns = [
    // Comments
    { type: 'comment', regex: /\/\/.*$/gm },
    { type: 'comment', regex: /\/\*[\s\S]*?\*\//g },
    // Strings
    { type: 'string', regex: /'([^'\\]|\\.)*'/g },
    { type: 'string', regex: /"([^"\\]|\\.)*"/g },
    { type: 'string', regex: /`([^`\\]|\\.)*`/g },
    // Keywords
    {
      type: 'keyword',
      regex:
        /\b(import|export|from|const|let|var|function|class|if|else|return|await|async|test|it|describe|expect|func|let|class|import|require|RSpec|do|end|def|Vizzly)\b/g,
    },
    // Functions
    { type: 'function', regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g },
    // Numbers
    { type: 'number', regex: /\b\d+\.?\d*\b/g },
  ];

  patterns.forEach(({ type, regex }) => {
    let match;
    while ((match = regex.exec(code)) !== null) {
      tokens.push({
        type,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  });

  // Sort by start position to handle overlaps (prioritize earlier patterns)
  tokens.sort((a, b) => a.start - b.start);

  // Remove overlaps (keep first token at each position)
  let filtered = [];
  let lastEnd = 0;
  tokens.forEach(token => {
    if (token.start >= lastEnd) {
      filtered.push(token);
      lastEnd = token.end;
    }
  });

  return filtered;
}

export default function CodeBlock({ code, language = 'javascript' }) {
  let codeRef = useRef(null);
  let isShell =
    language === 'shell' ||
    code.trim().startsWith('#') ||
    code.trim().startsWith('npm');

  useEffect(() => {
    // Check for browser support
    if (
      typeof window === 'undefined' ||
      !window.CSS?.highlights ||
      !codeRef.current
    )
      return;

    let textNode = codeRef.current.firstChild;
    if (!textNode || textNode.nodeType !== window.Node.TEXT_NODE) return;

    // Tokenize code
    let tokens = tokenize(code, isShell ? 'shell' : language);

    // Create ranges for each token
    let tokenRanges = tokens.map(token => {
      let range = new window.Range();
      range.setStart(textNode, token.start);
      range.setEnd(textNode, token.end);
      return { type: token.type, range };
    });

    // Group ranges by token type
    let highlightsByType = new Map();
    tokenRanges.forEach(({ type, range }) => {
      if (!highlightsByType.has(type)) {
        highlightsByType.set(type, []);
      }
      highlightsByType.get(type).push(range);
    });

    // Create highlights and register them
    let createdHighlights = new Map();

    for (let [type, ranges] of highlightsByType) {
      let highlight = new window.Highlight(...ranges);
      createdHighlights.set(type, highlight);
      window.CSS.highlights.set(`code-${type}`, highlight);
    }

    // Cleanup function
    return () => {
      for (let [type] of createdHighlights) {
        window.CSS.highlights.delete(`code-${type}`);
      }
    };
  }, [code, language, isShell]);

  return (
    <pre className="bg-slate-950 rounded-lg p-4 overflow-x-auto text-sm">
      <code
        ref={codeRef}
        className="font-mono text-slate-300 block whitespace-pre"
      >
        {code}
      </code>
    </pre>
  );
}
