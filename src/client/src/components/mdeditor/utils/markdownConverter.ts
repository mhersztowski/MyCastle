import TurndownService from 'turndown';
import Showdown from 'showdown';

const showdownConverter = new Showdown.Converter({
  tables: true,
  tasklists: true,
  strikethrough: true,
  ghCodeBlocks: true,
  simplifiedAutoLink: true,
  excludeTrailingPunctuationFromURLs: true,
  literalMidWordUnderscores: true,
  simpleLineBreaks: false,
});

// Helper to escape math content to protect it from showdown
function escapeMathForHtml(content: string): string {
  // Temporarily replace math blocks with placeholders
  const mathBlocks: string[] = [];
  const mathInlines: string[] = [];

  // Replace block math ($$...$$) first
  let result = content.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
    mathBlocks.push(latex.trim());
    return `%%MATHBLOCK_${mathBlocks.length - 1}%%`;
  });

  // Replace inline math ($...$) - but not $$ which are already replaced
  result = result.replace(/\$([^$\n]+?)\$/g, (_, latex) => {
    mathInlines.push(latex.trim());
    return `%%MATHINLINE_${mathInlines.length - 1}%%`;
  });

  return JSON.stringify({ result, mathBlocks, mathInlines });
}

// Helper to restore math content after showdown conversion
function restoreMathFromHtml(html: string, mathData: { mathBlocks: string[]; mathInlines: string[] }): string {
  let result = html;

  // Restore block math
  mathData.mathBlocks.forEach((latex, index) => {
    result = result.replace(
      `%%MATHBLOCK_${index}%%`,
      `<div data-type="math-block" data-latex="${encodeURIComponent(latex)}"></div>`
    );
    // Also handle if it was wrapped in a paragraph
    result = result.replace(
      `<p>%%MATHBLOCK_${index}%%</p>`,
      `<div data-type="math-block" data-latex="${encodeURIComponent(latex)}"></div>`
    );
  });

  // Restore inline math
  mathData.mathInlines.forEach((latex, index) => {
    result = result.replace(
      `%%MATHINLINE_${index}%%`,
      `<span data-type="inline-math" data-latex="${encodeURIComponent(latex)}"></span>`
    );
  });

  return result;
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});

turndownService.addRule('taskListItems', {
  filter: (node) => {
    return (
      node.nodeName === 'LI' &&
      node.parentNode?.nodeName === 'UL' &&
      (node.parentNode as HTMLElement).classList?.contains('md-editor-task-list')
    );
  },
  replacement: (content, node) => {
    const li = node as HTMLLIElement;
    const checkbox = li.querySelector('input[type="checkbox"]');
    const checked = checkbox?.hasAttribute('checked') || (checkbox as HTMLInputElement)?.checked;
    const marker = checked ? '[x]' : '[ ]';
    return `- ${marker} ${content.trim()}\n`;
  },
});

turndownService.addRule('highlight', {
  filter: 'mark',
  replacement: (content) => `==${content}==`,
});

// Image rule - handles both NodeView wrappers and plain img elements from renderHTML
turndownService.addRule('imageNodeView', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Match NodeView wrapper elements
    if (element.classList?.contains('image-node-wrapper')) return true;
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const img = element.querySelector('img');
      if (img) return true;
    }
    // Match plain img elements (from renderHTML output)
    if (element.nodeName === 'IMG') return true;
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    // Get the img element - either from wrapper or direct
    const img = element.nodeName === 'IMG'
      ? element as HTMLImageElement
      : (element.querySelector('img') as HTMLImageElement);
    if (!img) return '';

    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || '';
    const title = img.getAttribute('title');
    const style = img.getAttribute('style') || '';

    // Skip empty or placeholder images
    if (!src || src.includes('placeholder.com')) return '';

    // Extract width from style
    const widthMatch = style.match(/width:\s*(\d+%?)/);
    const width = widthMatch ? widthMatch[1] : null;

    // Extract alignment from style
    let align = '';
    if (style.includes('float: left')) align = 'left';
    else if (style.includes('float: right')) align = 'right';
    else if (style.includes('display: inline-block')) align = 'inline';

    // Build style attribute parts
    const styleParts: string[] = [];
    if (width && width !== '100%') styleParts.push(`width: ${width}`);
    if (align === 'left') styleParts.push('float: left');
    else if (align === 'right') styleParts.push('float: right');
    else if (align === 'inline') styleParts.push('display: inline-block');

    // Build markdown image - use HTML if we need width or alignment
    let result = '';
    if (styleParts.length > 0) {
      // Use HTML img tag for custom width/alignment
      result = `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''} style="${styleParts.join('; ')}" />`;
    } else if (title) {
      result = `![${alt}](${src} "${title}")`;
    } else {
      result = `![${alt}](${src})`;
    }

    return result;
  },
});

turndownService.addRule('tables', {
  filter: 'table',
  replacement: (_content, node) => {
    const table = node as HTMLTableElement;
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    // Check if table has custom column widths or cell alignments
    const hasCustomStyles = Array.from(table.querySelectorAll('th, td')).some(cell => {
      const style = (cell as HTMLElement).getAttribute('style') || '';
      const colwidth = (cell as HTMLElement).getAttribute('colwidth');
      return style.includes('width') || style.includes('text-align') || colwidth;
    });

    // If table has custom styles, output as HTML to preserve them
    if (hasCustomStyles) {
      let html = '\n<table>\n';
      rows.forEach((row, rowIndex) => {
        html += '  <tr>\n';
        const cells = Array.from(row.querySelectorAll('th, td'));
        cells.forEach(cell => {
          const tag = cell.tagName.toLowerCase();
          const style = (cell as HTMLElement).getAttribute('style') || '';
          const colwidth = (cell as HTMLElement).getAttribute('colwidth');

          // Build style string
          let styleAttr = '';
          const styles: string[] = [];

          // Extract width from colwidth attribute or style
          if (colwidth) {
            styles.push(`width: ${colwidth}px`);
          } else if (style.includes('width')) {
            const widthMatch = style.match(/width:\s*([^;]+)/);
            if (widthMatch) styles.push(`width: ${widthMatch[1].trim()}`);
          }

          // Extract text-align
          if (style.includes('text-align')) {
            const alignMatch = style.match(/text-align:\s*([^;]+)/);
            if (alignMatch) styles.push(`text-align: ${alignMatch[1].trim()}`);
          }

          if (styles.length > 0) {
            styleAttr = ` style="${styles.join('; ')}"`;
          }

          const content = cell.textContent?.trim() || '';
          html += `    <${tag}${styleAttr}>${content}</${tag}>\n`;
        });
        html += '  </tr>\n';
      });
      html += '</table>\n';
      return html;
    }

    // Simple markdown table (no custom widths)
    let markdown = '\n';
    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      const cellContents = cells.map(cell => cell.textContent?.trim() || '');
      markdown += '| ' + cellContents.join(' | ') + ' |\n';

      if (rowIndex === 0) {
        markdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
      }
    });
    return markdown + '\n';
  },
});

// Math block rule - handles both direct elements and NodeView wrappers
turndownService.addRule('mathBlock', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Direct match
    if (element.getAttribute('data-type') === 'math-block') return true;
    // NodeView wrapper match
    if (element.classList?.contains('math-block-wrapper')) return true;
    // Check for data-node-view-wrapper with mathBlock type
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const inner = element.querySelector('[data-type="math-block"]');
      if (inner) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    // Try to find latex in various places
    let latex = '';

    // Direct attribute
    const encodedLatex = element.getAttribute('data-latex');
    if (encodedLatex) {
      latex = decodeURIComponent(encodedLatex);
    } else {
      // Look in nested element
      const inner = element.querySelector('[data-latex]');
      if (inner) {
        const innerLatex = inner.getAttribute('data-latex');
        latex = innerLatex ? decodeURIComponent(innerLatex) : '';
      }
    }

    // Fallback to text content if no latex attribute found
    if (!latex) {
      // Try to get KaTeX rendered text
      const katexElement = element.querySelector('.katex-mathml annotation');
      if (katexElement) {
        latex = katexElement.textContent || '';
      } else {
        latex = element.textContent || '';
      }
    }

    return latex ? `\n$$${latex}$$\n` : '';
  },
});

// Inline math rule - handles both direct elements and NodeView wrappers
turndownService.addRule('inlineMath', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Direct match
    if (element.getAttribute('data-type') === 'inline-math') return true;
    // NodeView wrapper match
    if (element.classList?.contains('inline-math-wrapper')) return true;
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    let latex = '';

    // Direct attribute
    const encodedLatex = element.getAttribute('data-latex');
    if (encodedLatex) {
      latex = decodeURIComponent(encodedLatex);
    } else {
      // Look in nested element
      const inner = element.querySelector('[data-latex]');
      if (inner) {
        const innerLatex = inner.getAttribute('data-latex');
        latex = innerLatex ? decodeURIComponent(innerLatex) : '';
      }
    }

    // Fallback to KaTeX annotation
    if (!latex) {
      const katexElement = element.querySelector('.katex-mathml annotation');
      if (katexElement) {
        latex = katexElement.textContent || '';
      }
    }

    return latex ? `$${latex}$` : '';
  },
});

export function markdownToHtml(markdown: string): string {
  if (!markdown || markdown.trim() === '') {
    return '';
  }

  // First, protect math content from showdown processing
  const mathDataStr = escapeMathForHtml(markdown);
  const { result: escapedMarkdown, mathBlocks, mathInlines } = JSON.parse(mathDataStr);

  let html = showdownConverter.makeHtml(escapedMarkdown);

  // Restore math content
  html = restoreMathFromHtml(html, { mathBlocks, mathInlines });

  html = html.replace(
    /<li>\s*\[([ xX])\]\s*/g,
    (_, checked) => {
      const isChecked = checked.toLowerCase() === 'x';
      return `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox"${isChecked ? ' checked' : ''}></label><div>`;
    }
  );

  html = html.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  return html;
}

export function htmlToMarkdown(html: string): string {
  if (!html || html.trim() === '' || html === '<p></p>') {
    return '';
  }

  return turndownService.turndown(html);
}
