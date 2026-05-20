// Simple tokenizer for different languages
function tokenize(code, language) {
  let tokens = [];

  if (language === 'shell') {
    code.split('\n').forEach((line, lineNum) => {
      const lineStart =
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

  for (let { type, regex } of patterns) {
    let match = regex.exec(code);
    while (match !== null) {
      tokens.push({
        type,
        start: match.index,
        end: match.index + match[0].length,
      });
      match = regex.exec(code);
    }
  }

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

function getTokenClass(type) {
  return `code-token code-token--${type}`;
}

function renderTokenizedCode(code, language) {
  let tokens = tokenize(code, language);
  let pieces = [];
  let cursor = 0;

  tokens.forEach((token, index) => {
    if (token.start > cursor) {
      pieces.push(code.slice(cursor, token.start));
    }

    pieces.push(
      <span
        className={getTokenClass(token.type)}
        key={`${token.type}-${index}`}
      >
        {code.slice(token.start, token.end)}
      </span>
    );
    cursor = token.end;
  });

  if (cursor < code.length) {
    pieces.push(code.slice(cursor));
  }

  return pieces;
}

export default function CodeBlock({ code, language = 'javascript' }) {
  let isShell =
    language === 'shell' ||
    code.trim().startsWith('#') ||
    code.trim().startsWith('npm');
  let highlightedCode = renderTokenizedCode(code, isShell ? 'shell' : language);

  return (
    <pre className="bg-slate-950 rounded-lg p-4 overflow-x-auto text-sm">
      <code className="font-mono text-slate-300 block whitespace-pre">
        {highlightedCode}
      </code>
    </pre>
  );
}
