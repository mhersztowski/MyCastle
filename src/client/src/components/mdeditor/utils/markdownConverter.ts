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

// Helper to escape component embeds to protect them from showdown
function escapeComponentEmbedsForHtml(content: string): string {
  const componentEmbeds: { type: string; id: string }[] = [];

  // Replace @[type:id] syntax with placeholders
  // Matches: @[person:uuid-123], @[task:abc], @[project:xyz], @[person:] (empty id)
  const result = content.replace(/@\[(person|task|project):([^\]]*)\]/g, (_, type, id) => {
    componentEmbeds.push({ type, id: id.trim() });
    return `%%COMPONENTEMBED_${componentEmbeds.length - 1}%%`;
  });

  return JSON.stringify({ result, componentEmbeds });
}

// Helper to escape automate script blocks (```automate code fences) to protect from showdown
function escapeAutomateScriptsForHtml(content: string): string {
  const automateScripts: { code: string; blockId: string }[] = [];

  // Match ```automate or ```automate:blockId code fences
  const result = content.replace(/```automate(?::([^\n]*))?\n([\s\S]*?)```/g, (_, blockId, code) => {
    automateScripts.push({
      code: code.trimEnd(),
      blockId: blockId?.trim() || '',
    });
    return `%%AUTOMATESCRIPT_${automateScripts.length - 1}%%`;
  });

  return JSON.stringify({ result, automateScripts });
}

// Helper to escape automate flow embeds (@[automate:id]) to protect from showdown
function escapeAutomateFlowsForHtml(content: string): string {
  const automateFlows: { id: string }[] = [];

  const result = content.replace(/@\[automate:([^\]]+)\]/g, (_, id) => {
    automateFlows.push({ id: id.trim() });
    return `%%AUTOMATEFLOW_${automateFlows.length - 1}%%`;
  });

  return JSON.stringify({ result, automateFlows });
}

// Helper to restore automate flow embeds after showdown conversion
function restoreAutomateFlowsFromHtml(html: string, automateFlows: { id: string }[]): string {
  let result = html;

  automateFlows.forEach((flow, index) => {
    const htmlTag = `<div data-type="automate-flow-embed" data-flow-id="${flow.id}"></div>`;
    const placeholder = `%%AUTOMATEFLOW_${index}%%`;

    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
    result = result.split(placeholder).join(htmlTag);
  });

  return result;
}

// Helper to restore automate script blocks after showdown conversion
function restoreAutomateScriptsFromHtml(html: string, automateScripts: { code: string; blockId: string }[]): string {
  let result = html;

  automateScripts.forEach((script, index) => {
    const blockIdAttr = script.blockId ? ` data-block-id="${script.blockId}"` : '';
    const htmlTag = `<div data-type="automate-script-block"${blockIdAttr} data-code="${encodeURIComponent(script.code)}"></div>`;
    const placeholder = `%%AUTOMATESCRIPT_${index}%%`;

    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
    result = result.split(placeholder).join(htmlTag);
  });

  return result;
}

// Helper to escape UI form embeds to protect them from showdown
function escapeUIFormsForHtml(content: string): string {
  const uiForms: { id: string; inline?: string }[] = [];

  // Match @[uiform:form-id] syntax (simple reference)
  let result = content.replace(/@\[uiform:([^\]\{][^\]]*)\]/g, (_, id) => {
    uiForms.push({ id: id.trim() });
    return `%%UIFORM_${uiForms.length - 1}%%`;
  });

  // Match @[uiform:{...}] inline JSON syntax
  result = result.replace(/@\[uiform:(\{[\s\S]*?\})\]/g, (_, json) => {
    uiForms.push({ id: '', inline: json });
    return `%%UIFORM_${uiForms.length - 1}%%`;
  });

  return JSON.stringify({ result, uiForms });
}

// Helper to restore UI forms after showdown conversion
function restoreUIFormsFromHtml(html: string, uiForms: { id: string; inline?: string }[]): string {
  let result = html;

  uiForms.forEach((form, index) => {
    const attrs = form.inline
      ? `data-type="ui-form-embed" data-inline="${encodeURIComponent(form.inline)}"`
      : `data-type="ui-form-embed" data-form-id="${form.id}"`;

    const htmlTag = `<div ${attrs}></div>`;
    const placeholder = `%%UIFORM_${index}%%`;

    // Handle placeholder wrapped in paragraph
    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
    // Handle standalone placeholder
    result = result.split(placeholder).join(htmlTag);
  });

  return result;
}

// Helper to restore component embeds after showdown conversion
function restoreComponentEmbedsFromHtml(html: string, componentEmbeds: { type: string; id: string }[]): string {
  let result = html;

  componentEmbeds.forEach((embed, index) => {
    // Use zero-width space inside span to ensure Tiptap recognizes it as a node
    const htmlTag = `<span data-type="component-embed" data-component-type="${embed.type}" data-component-id="${embed.id}">\u200B</span>`;
    const placeholder = `%%COMPONENTEMBED_${index}%%`;

    // Replace all occurrences of the placeholder with the HTML tag
    // This handles placeholders inside paragraphs, standalone, or wrapped
    result = result.split(placeholder).join(htmlTag);
  });

  return result;
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

// Audio rule - handles both NodeView wrappers and plain audio elements from renderHTML
turndownService.addRule('audioNodeView', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Match NodeView wrapper elements
    if (element.classList?.contains('audio-node-wrapper')) return true;
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const audio = element.querySelector('audio');
      if (audio) return true;
    }
    // Match plain audio elements (from renderHTML output)
    if (element.nodeName === 'AUDIO') return true;
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    // Get the audio element - either from wrapper or direct
    const audio = element.nodeName === 'AUDIO'
      ? element as HTMLAudioElement
      : (element.querySelector('audio') as HTMLAudioElement);
    if (!audio) return '';

    const src = audio.getAttribute('src') || '';
    const title = audio.getAttribute('data-title') || audio.getAttribute('title') || '';
    const controls = audio.hasAttribute('controls');
    const autoplay = audio.hasAttribute('autoplay');
    const loop = audio.hasAttribute('loop');

    // Skip empty audio
    if (!src) return '';

    // Build HTML audio tag with all attributes
    const attrs: string[] = [`src="${src}"`];
    if (title) attrs.push(`data-title="${title}"`);
    if (controls) attrs.push('controls');
    if (autoplay) attrs.push('autoplay');
    if (loop) attrs.push('loop');

    return `\n<audio ${attrs.join(' ')}></audio>\n`;
  },
});

// Video rule - handles both NodeView wrappers and plain video elements from renderHTML
turndownService.addRule('videoNodeView', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Match NodeView wrapper elements
    if (element.classList?.contains('video-node-wrapper')) return true;
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const video = element.querySelector('video');
      if (video) return true;
    }
    // Match plain video elements (from renderHTML output)
    if (element.nodeName === 'VIDEO') return true;
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    // Get the video element - either from wrapper or direct
    const video = element.nodeName === 'VIDEO'
      ? element as HTMLVideoElement
      : (element.querySelector('video') as HTMLVideoElement);
    if (!video) return '';

    const src = video.getAttribute('src') || '';
    const title = video.getAttribute('data-title') || video.getAttribute('title') || '';
    const poster = video.getAttribute('poster') || '';
    const controls = video.hasAttribute('controls');
    const autoplay = video.hasAttribute('autoplay');
    const loop = video.hasAttribute('loop');
    const muted = video.hasAttribute('muted');
    const style = video.getAttribute('style') || '';

    // Skip empty video
    if (!src) return '';

    // Extract width from style
    const widthMatch = style.match(/width:\s*(\d+%?)/);
    const width = widthMatch ? widthMatch[1] : null;

    // Extract alignment from style (default center for video)
    // renderHTML outputs: left = "margin-left: 0; margin-right: auto"
    //                     right = "margin-left: auto; margin-right: 0"
    //                     center = "margin-left: auto; margin-right: auto"
    let align = 'center';
    const hasMarginLeftAuto = style.includes('margin-left: auto');
    const hasMarginRightAuto = style.includes('margin-right: auto');
    const hasMarginLeft0 = style.includes('margin-left: 0');
    const hasMarginRight0 = style.includes('margin-right: 0');

    if (hasMarginLeft0 && hasMarginRightAuto) align = 'left';
    else if (hasMarginLeftAuto && hasMarginRight0) align = 'right';

    // Build HTML video tag with all attributes
    const attrs: string[] = [`src="${src}"`];
    if (title) attrs.push(`data-title="${title}"`);
    if (poster) attrs.push(`poster="${poster}"`);
    if (controls) attrs.push('controls');
    if (autoplay) attrs.push('autoplay');
    if (loop) attrs.push('loop');
    if (muted) attrs.push('muted');

    // Build style - replicate the same format as renderHTML for consistency
    const styleParts: string[] = [];
    if (width) styleParts.push(`width: ${width}`);
    if (align === 'left') {
      styleParts.push('margin-left: 0', 'margin-right: auto');
    } else if (align === 'right') {
      styleParts.push('margin-left: auto', 'margin-right: 0');
    } else {
      styleParts.push('margin-left: auto', 'margin-right: auto');
    }
    styleParts.push('display: block');

    attrs.push(`style="${styleParts.join('; ')}"`);

    return `\n<video ${attrs.join(' ')}></video>\n`;
  },
});

// Helper to pre-process column content - convert math blocks to markdown syntax before turndown
function preprocessColumnContent(html: string): string {
  // Convert math blocks to $$...$$ syntax before turndown processes them
  let result = html;

  // Match math block divs and convert to markdown
  result = result.replace(
    /<div[^>]*data-type="math-block"[^>]*data-latex="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (_, encodedLatex) => {
      const latex = decodeURIComponent(encodedLatex || '');
      return latex ? `\n$$${latex}$$\n` : '';
    }
  );

  // Match inline math spans and convert to markdown
  result = result.replace(
    /<span[^>]*data-type="inline-math"[^>]*data-latex="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_, encodedLatex) => {
      const latex = decodeURIComponent(encodedLatex || '');
      return latex ? `$${latex}$` : '';
    }
  );

  return result;
}

// Column layout rule - handles the column layout container
// Save content as markdown for better portability and viewer compatibility
turndownService.addRule('columnLayout', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Match NodeView wrapper elements
    if (element.classList?.contains('column-layout-wrapper')) return true;
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const layout = element.querySelector('[data-column-layout]');
      if (layout) return true;
    }
    // Match direct column layout div
    if (element.hasAttribute('data-column-layout')) return true;
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    // Get the column layout element - either from wrapper or direct
    const layout = element.hasAttribute('data-column-layout')
      ? element
      : (element.querySelector('[data-column-layout]') as HTMLElement);

    if (!layout) return '';

    // Find all column divs
    const columns = layout.querySelectorAll('[data-column]');
    if (columns.length === 0) return '';

    let result = '\n<div data-column-layout class="md-editor-columns">\n';

    columns.forEach((column) => {
      const colElement = column as HTMLElement;
      const width = colElement.getAttribute('data-width') || colElement.style.width || '';

      // Pre-process math blocks before turndown (turndown has issues with empty divs)
      const preprocessedHtml = preprocessColumnContent(colElement.innerHTML);

      // Convert inner content to markdown
      const columnMarkdown = turndownService.turndown(preprocessedHtml).trim();

      result += `<div data-column${width ? ` style="width: ${width}"` : ''}>\n\n${columnMarkdown}\n\n</div>\n`;
    });

    result += '</div>\n';
    return result;
  },
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
      rows.forEach((row) => {
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

// Component embed rule - converts back to @[type:id] syntax
turndownService.addRule('componentEmbed', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Direct match
    if (element.getAttribute('data-type') === 'component-embed') return true;
    // NodeView wrapper match
    if (element.classList?.contains('component-embed-wrapper')) return true;
    // Check for data-node-view-wrapper with componentEmbed type
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const inner = element.querySelector('[data-type="component-embed"]');
      if (inner) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    let componentType = '';
    let componentId = '';

    // Direct attributes
    componentType = element.getAttribute('data-component-type') || '';
    componentId = element.getAttribute('data-component-id') || '';

    // Look in nested element if not found
    if (!componentType || !componentId) {
      const inner = element.querySelector('[data-type="component-embed"]');
      if (inner) {
        componentType = inner.getAttribute('data-component-type') || '';
        componentId = inner.getAttribute('data-component-id') || '';
      }
    }

    // Always save component embed if type is valid, even with empty ID
    if (componentType) {
      return `@[${componentType}:${componentId || ''}]`;
    }

    return '';
  },
});

// UI Form embed rule - converts back to @[uiform:id] or @[uiform:{...}] syntax
turndownService.addRule('uiFormEmbed', {
  filter: (node) => {
    const element = node as HTMLElement;
    // Direct match
    if (element.getAttribute('data-type') === 'ui-form-embed') return true;
    // NodeView wrapper match
    if (element.classList?.contains('ui-form-wrapper')) return true;
    // Check for data-node-view-wrapper with uiFormEmbed type
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const inner = element.querySelector('[data-type="ui-form-embed"]');
      if (inner) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    let formId = '';
    let inlineData = '';

    // Direct attributes
    formId = element.getAttribute('data-form-id') || '';
    const encodedInline = element.getAttribute('data-inline');
    if (encodedInline) {
      inlineData = decodeURIComponent(encodedInline);
    }

    // Look in nested element if not found
    if (!formId && !inlineData) {
      const inner = element.querySelector('[data-type="ui-form-embed"]');
      if (inner) {
        formId = inner.getAttribute('data-form-id') || '';
        const innerEncodedInline = inner.getAttribute('data-inline');
        if (innerEncodedInline) {
          inlineData = decodeURIComponent(innerEncodedInline);
        }
      }
    }

    // Return appropriate markdown format
    if (inlineData) {
      return `\n@[uiform:${inlineData}]\n`;
    }
    if (formId) {
      return `\n@[uiform:${formId}]\n`;
    }

    return '';
  },
});

// Automate flow embed rule - converts back to @[automate:id] syntax
turndownService.addRule('automateFlowEmbed', {
  filter: (node) => {
    const element = node as HTMLElement;
    if (element.getAttribute('data-type') === 'automate-flow-embed') return true;
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const inner = element.querySelector('[data-type="automate-flow-embed"]');
      if (inner) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    let flowId = element.getAttribute('data-flow-id') || '';

    if (!flowId) {
      const inner = element.querySelector('[data-type="automate-flow-embed"]');
      if (inner) flowId = inner.getAttribute('data-flow-id') || '';
    }

    return flowId ? `\n@[automate:${flowId}]\n` : '';
  },
});

// Automate script block rule - converts back to ```automate code fence
turndownService.addRule('automateScriptBlock', {
  filter: (node) => {
    const element = node as HTMLElement;
    if (element.getAttribute('data-type') === 'automate-script-block') return true;
    if (element.getAttribute('data-node-view-wrapper') !== null) {
      const inner = element.querySelector('[data-type="automate-script-block"]');
      if (inner) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    let code = '';
    let blockId = '';

    const encodedCode = element.getAttribute('data-code');
    if (encodedCode) {
      code = decodeURIComponent(encodedCode);
    }
    blockId = element.getAttribute('data-block-id') || '';

    if (!code && !blockId) {
      const inner = element.querySelector('[data-type="automate-script-block"]');
      if (inner) {
        const innerCode = inner.getAttribute('data-code');
        code = innerCode ? decodeURIComponent(innerCode) : '';
        blockId = inner.getAttribute('data-block-id') || '';
      }
    }

    const langTag = blockId ? `automate:${blockId}` : 'automate';
    return `\n\`\`\`${langTag}\n${code}\n\`\`\`\n`;
  },
});

// Helper to process markdown inside column divs
function processColumnLayouts(html: string): string {
  // Use DOM parser to properly handle nested elements
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstChild as HTMLElement;

  // Find all column layout divs
  const columnLayouts = container.querySelectorAll('[data-column-layout]');

  columnLayouts.forEach((layout) => {
    // Find all column divs inside this layout
    const columns = layout.querySelectorAll('[data-column]');

    columns.forEach((column) => {
      const content = column.textContent?.trim() || '';
      if (content) {
        // Convert markdown content inside the column to HTML
        let columnHtml = showdownConverter.makeHtml(content);
        // Handle highlight syntax
        columnHtml = columnHtml.replace(/==([^=]+)==/g, '<mark>$1</mark>');
        column.innerHTML = columnHtml;
      } else {
        column.innerHTML = '<p></p>';
      }
    });
  });

  return container.innerHTML;
}

export function markdownToHtml(markdown: string): string {
  if (!markdown || markdown.trim() === '') {
    return '';
  }

  // First, protect automate script blocks (code fences) from showdown processing
  const automateScriptDataStr = escapeAutomateScriptsForHtml(markdown);
  const { result: markdownWithoutScripts, automateScripts } = JSON.parse(automateScriptDataStr);

  // Protect automate flow embeds from showdown processing
  const automateFlowDataStr = escapeAutomateFlowsForHtml(markdownWithoutScripts);
  const { result: markdownWithoutFlows, automateFlows } = JSON.parse(automateFlowDataStr);

  // Protect UI form embeds from showdown processing
  const uiFormDataStr = escapeUIFormsForHtml(markdownWithoutFlows);
  const { result: markdownWithoutUIForms, uiForms } = JSON.parse(uiFormDataStr);

  // Then, protect component embeds from showdown processing
  const componentDataStr = escapeComponentEmbedsForHtml(markdownWithoutUIForms);
  const { result: markdownWithoutComponents, componentEmbeds } = JSON.parse(componentDataStr);

  // Then, protect math content from showdown processing
  const mathDataStr = escapeMathForHtml(markdownWithoutComponents);
  const { result: escapedMarkdown, mathBlocks, mathInlines } = JSON.parse(mathDataStr);

  let html = showdownConverter.makeHtml(escapedMarkdown);

  // Process markdown inside column layouts (showdown doesn't process content inside HTML tags)
  html = processColumnLayouts(html);

  // Restore math content
  html = restoreMathFromHtml(html, { mathBlocks, mathInlines });

  // Restore component embeds
  html = restoreComponentEmbedsFromHtml(html, componentEmbeds);

  // Restore UI form embeds
  html = restoreUIFormsFromHtml(html, uiForms);

  // Restore automate flow embeds
  html = restoreAutomateFlowsFromHtml(html, automateFlows);

  // Restore automate script blocks
  html = restoreAutomateScriptsFromHtml(html, automateScripts);

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

  // Pre-process: Replace UI form embeds with placeholders before Turndown
  const uiForms: { id: string; inline?: string }[] = [];

  let processedHtml = html.replace(
    /<div[^>]*data-type="ui-form-embed"[^>]*data-form-id="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (_, formId) => {
      uiForms.push({ id: formId });
      return `##UIFORMEMBED${uiForms.length - 1}##`;
    }
  );

  // Match inline form data
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="ui-form-embed"[^>]*data-inline="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (_, encodedInline) => {
      uiForms.push({ id: '', inline: decodeURIComponent(encodedInline) });
      return `##UIFORMEMBED${uiForms.length - 1}##`;
    }
  );

  // Pre-process: Replace automate flow embeds with placeholders before Turndown
  const automateFlows: { id: string }[] = [];

  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="automate-flow-embed"[^>]*data-flow-id="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (_, flowId) => {
      automateFlows.push({ id: flowId });
      return `##AUTOMATEFLOW${automateFlows.length - 1}##`;
    }
  );

  // Pre-process: Replace automate script blocks with placeholders before Turndown
  const automateScripts: { code: string; blockId: string }[] = [];

  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="automate-script-block"[^>]*?(?:data-block-id="([^"]*)")?[^>]*?(?:data-code="([^"]*)")?[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      const codeMatch = match.match(/data-code="([^"]*)"/);
      const blockIdMatch = match.match(/data-block-id="([^"]*)"/);
      automateScripts.push({
        code: codeMatch ? decodeURIComponent(codeMatch[1]) : '',
        blockId: blockIdMatch ? blockIdMatch[1] : '',
      });
      return `##AUTOMATESCRIPT${automateScripts.length - 1}##`;
    }
  );

  // Pre-process: Replace component embeds with placeholders before Turndown
  // This ensures they survive Turndown processing
  // Using placeholder without underscores to avoid Turndown escaping them
  const componentEmbeds: { type: string; id: string }[] = [];

  // Match both formats: with data- prefix and without (Tiptap generates both)
  processedHtml = processedHtml.replace(
    /<span[^>]*data-type="component-embed"[^>]*data-component-type="([^"]*)"[^>]*data-component-id="([^"]*)"[^>]*>[\s\S]*?<\/span>/gi,
    (_, type, id) => {
      componentEmbeds.push({ type, id });
      return `##COMPEMBED${componentEmbeds.length - 1}##`;
    }
  );

  // Also match if attributes are in different order
  processedHtml = processedHtml.replace(
    /<span[^>]*data-component-type="([^"]*)"[^>]*data-component-id="([^"]*)"[^>]*data-type="component-embed"[^>]*>[\s\S]*?<\/span>/gi,
    (_, type, id) => {
      componentEmbeds.push({ type, id });
      return `##COMPEMBED${componentEmbeds.length - 1}##`;
    }
  );

  // Pre-process math blocks - turndown has issues with empty divs
  // Convert math blocks to markdown syntax before turndown processes them
  processedHtml = preprocessColumnContent(processedHtml);

  let markdown = turndownService.turndown(processedHtml);

  // Post-process: Restore UI form embeds as @[uiform:...] syntax
  uiForms.forEach((form, index) => {
    const placeholder = `##UIFORMEMBED${index}##`;
    const replacement = form.inline
      ? `@[uiform:${form.inline}]`
      : form.id
        ? `@[uiform:${form.id}]`
        : '';
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore component embeds as @[type:id] syntax
  componentEmbeds.forEach((embed, index) => {
    const placeholder = `##COMPEMBED${index}##`;
    const replacement = embed.type ? `@[${embed.type}:${embed.id || ''}]` : '';
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore automate flow embeds as @[automate:id] syntax
  automateFlows.forEach((flow, index) => {
    const placeholder = `##AUTOMATEFLOW${index}##`;
    const replacement = flow.id ? `@[automate:${flow.id}]` : '';
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore automate script blocks as ```automate code fences
  automateScripts.forEach((script, index) => {
    const placeholder = `##AUTOMATESCRIPT${index}##`;
    const langTag = script.blockId ? `automate:${script.blockId}` : 'automate';
    const replacement = `\n\`\`\`${langTag}\n${script.code}\n\`\`\`\n`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  return markdown;
}
