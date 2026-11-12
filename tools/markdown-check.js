import fs from 'node:fs';
import path from 'node:path';

/** Return local-link and fenced-code diagnostics for Markdown files. */
export function inspectMarkdownFiles(root, files) {
  const issues = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const relativeFile = path.relative(root, file);
    let fence = null;

    for (let i = 0; i < lines.length; i++) {
      if (fence) {
        const close = lines[i].match(/^\s*(`+|~+)\s*$/);
        if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
        continue;
      }

      const fenceMatch = lines[i].match(/^\s*(?:(?:[-+*]|\d+[.)])\s+)*(?:>\s*)*(`{3,}|~{3,})/);
      if (fenceMatch) {
        fence = { char: fenceMatch[1][0], length: fenceMatch[1].length, line: i + 1 };
        continue;
      }

      const plainLine = lines[i].replace(/`+[^`]*`+/g, '');
      for (const match of plainLine.matchAll(/!?(?:\[[^\]]*\])\(([^)]*)\)/g)) {
        const body = match[1].trim();
        const angle = body.match(/^<([^>]*)>/);
        const destination = angle ? angle[1] : body.match(/^[^\s]+/)?.[0];
        if (!destination || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(destination)) continue;

        let localPath;
        try {
          localPath = decodeURIComponent(destination.split(/[?#]/, 1)[0]);
        } catch {
          issues.push({ file: relativeFile, line: i + 1, message: `invalid URL encoding in Markdown link: ${destination}` });
          continue;
        }
        if (!localPath) continue;

        const target = localPath.startsWith('/')
          ? path.resolve(root, `.${localPath}`)
          : path.resolve(path.dirname(file), localPath);
        if (!fs.existsSync(target)) {
          issues.push({ file: relativeFile, line: i + 1, message: `broken Markdown link: ${destination}` });
        }
      }
    }

    if (fence) issues.push({ file: relativeFile, line: fence.line, message: 'unclosed Markdown code fence' });
  }
  return issues;
}
