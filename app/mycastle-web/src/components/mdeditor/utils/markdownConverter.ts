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
// Format: ```automate, ```automate:blockId, ```automate::autorun, ```automate:blockId:autorun
function escapeAutomateScriptsForHtml(content: string): string {
  // viewMode added so a block saved as 'html' (renders return value as HTML)
  // survives the markdown round-trip. Persisted as an extra `:html` segment
  // in the fence params alongside the existing `:autorun` flag.
  // tags persist via an extra `:t=a,b,c` token (prefix `t=`) so they don't
  // clash with existing flag tokens (`autorun`, `html`) and so unknown
  // future tokens are easy to skip.
  // windowHeight persists as `:h=NNN` token — same prefix pattern as tags,
  // so the parser can find them in any order.
  const automateScripts: { code: string; blockId: string; autorun: boolean; viewMode: 'code' | 'html'; tags: string[]; windowHeight: number | null }[] = [];

  // Match ```automate or ```automate:blockId or ```automate:blockId:autorun:html:t=a,b:h=360 code fences
  const result = content.replace(/```automate(?::([^\n]*))?\n([\s\S]*?)```/g, (_, params, code) => {
    const parts = (params?.trim() || '').split(':');
    const blockId = parts[0] || '';
    const autorun = parts.includes('autorun');
    const viewMode: 'code' | 'html' = parts.includes('html') ? 'html' : 'code';
    // Find the `t=…` token if present. URL-decode each individual tag so
    // that values with special characters (spaces, accents, …) survive.
    const tagsToken = parts.find((p: string) => p.startsWith('t='));
    const tags: string[] = tagsToken
      ? tagsToken.slice(2).split(',').map((t: string) => {
          try { return decodeURIComponent(t.trim()); }
          catch { return t.trim(); }
        }).filter(Boolean)
      : [];
    // `h=NNN` token for windowHeight. Garbage / negative values are
    // dropped silently — the block falls back to auto-size.
    const hToken = parts.find((p: string) => p.startsWith('h='));
    const hNum = hToken ? Number(hToken.slice(2)) : NaN;
    const windowHeight: number | null = Number.isFinite(hNum) && hNum > 0 ? hNum : null;
    automateScripts.push({
      code: code.trimEnd(),
      blockId,
      autorun,
      viewMode,
      tags,
      windowHeight,
    });
    return `%%AUTOMATESCRIPT_${automateScripts.length - 1}%%`;
  });

  return JSON.stringify({ result, automateScripts });
}

// Helper to escape automate flow embeds (@[automate:id] or @[automate:id:autorun]) to protect from showdown
function escapeAutomateFlowsForHtml(content: string): string {
  const automateFlows: { id: string; autorun: boolean }[] = [];

  // Match @[automate:id] or @[automate:id:autorun]
  const result = content.replace(/@\[automate:([^\]]+)\]/g, (_, params) => {
    const parts = params.trim().split(':');
    const id = parts[0] || '';
    const autorun = parts[1] === 'autorun';
    automateFlows.push({ id, autorun });
    return `%%AUTOMATEFLOW_${automateFlows.length - 1}%%`;
  });

  return JSON.stringify({ result, automateFlows });
}

// Helper to restore automate flow embeds after showdown conversion
function restoreAutomateFlowsFromHtml(html: string, automateFlows: { id: string; autorun: boolean }[]): string {
  let result = html;

  automateFlows.forEach((flow, index) => {
    const autorunAttr = flow.autorun ? ' data-autorun="true"' : ' data-autorun="false"';
    const htmlTag = `<div data-type="automate-flow-embed" data-flow-id="${flow.id}"${autorunAttr}></div>`;
    const placeholder = `%%AUTOMATEFLOW_${index}%%`;

    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
    result = result.split(placeholder).join(htmlTag);
  });

  return result;
}

// ─── EventBlock fence ────────────────────────────────────────────────────────
// Pulls ```event …``` fences out of the markdown before showdown runs, then
// re-injects them as <div data-type="event-block" data-…="…"> HTML so the
// TipTap EventBlock node can parse them back into structured attrs.

interface EventBlockEscaped {
  eventName: string;
  start: string;
  end: string;
  description: string;
  taskId: string;
  taskName: string;
  projectName: string;
}

function escapeEventBlocksForHtml(content: string): { result: string; events: EventBlockEscaped[] } {
  const events: EventBlockEscaped[] = [];
  const result = content.replace(/```event\s*\n([\s\S]*?)```/g, (_, json: string) => {
    let parsed: Partial<EventBlockEscaped> = {};
    try { parsed = JSON.parse(json.trim()) as Partial<EventBlockEscaped>; }
    catch { /* malformed JSON — store empty event so the placeholder still
                 round-trips instead of bleeding into surrounding markdown. */ }
    events.push({
      eventName:   String(parsed.eventName   ?? ''),
      start:       String(parsed.start       ?? ''),
      end:         String(parsed.end         ?? ''),
      description: String(parsed.description ?? ''),
      taskId:      String(parsed.taskId      ?? ''),
      taskName:    String(parsed.taskName    ?? ''),
      projectName: String(parsed.projectName ?? ''),
    });
    return `%%EVENTBLOCK_${events.length - 1}%%`;
  });
  return { result, events };
}

function restoreEventBlocksFromHtml(html: string, events: EventBlockEscaped[]): string {
  let result = html;
  events.forEach((ev, index) => {
    const attrs: string[] = ['data-type="event-block"'];
    const push = (key: string, val: string) => {
      if (val) attrs.push(`${key}="${encodeURIComponent(val)}"`);
    };
    push('data-event-name',  ev.eventName);
    push('data-start',       ev.start);
    push('data-end',         ev.end);
    push('data-description', ev.description);
    push('data-task-id',     ev.taskId);
    push('data-task-name',   ev.taskName);
    push('data-project-name', ev.projectName);
    const htmlTag = `<div ${attrs.join(' ')}></div>`;
    const placeholder = `%%EVENTBLOCK_${index}%%`;
    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
    result = result.split(placeholder).join(htmlTag);
  });
  return result;
}

// Helper to restore automate script blocks after showdown conversion
function restoreAutomateScriptsFromHtml(html: string, automateScripts: { code: string; blockId: string; autorun: boolean; viewMode?: 'code' | 'html'; tags?: string[]; windowHeight?: number | null }[]): string {
  let result = html;

  automateScripts.forEach((script, index) => {
    const blockIdAttr = script.blockId ? ` data-block-id="${script.blockId}"` : '';
    const autorunAttr = ` data-autorun="${script.autorun ? 'true' : 'false'}"`;
    const viewModeAttr = ` data-view-mode="${script.viewMode === 'html' ? 'html' : 'code'}"`;
    // Tags re-encoded per-element so commas inside a tag (defensively, even
    // though the dialog rejects them) can't break the round-trip back into
    // attr parsing.
    const tagsAttr = (script.tags && script.tags.length > 0)
      ? ` data-tags="${script.tags.map(t => encodeURIComponent(t)).join(',')}"`
      : '';
    const whAttr = (typeof script.windowHeight === 'number' && script.windowHeight > 0)
      ? ` data-window-height="${script.windowHeight}"`
      : '';
    const htmlTag = `<div data-type="automate-script-block"${blockIdAttr}${autorunAttr}${viewModeAttr}${tagsAttr}${whAttr} data-code="${encodeURIComponent(script.code)}"></div>`;
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

// Helper to escape CAD view embeds (@[cad:mode:https://server/viewer/...]) from showdown.
// Format: @[cad:{mode}:{fullViewerUrl}] — split only on first colon after mode.
function escapeCadViewEmbedsForHtml(content: string): string {
  const cadViews: { mode: string; url: string }[] = [];
  const result = content.replace(/@\[cad:([^\]]+)\]/g, (_, params) => {
    const firstColon = params.indexOf(':');
    const mode = firstColon >= 0 ? params.slice(0, firstColon) : params;
    const url  = firstColon >= 0 ? params.slice(firstColon + 1) : '';
    cadViews.push({ mode: mode || 'scene3d', url });
    return `%%CADVIEW_${cadViews.length - 1}%%`;
  });
  return JSON.stringify({ result, cadViews });
}

// Helper to restore CAD view embeds after showdown conversion
function restoreCadViewEmbedsFromHtml(html: string, cadViews: { mode: string; url: string }[]): string {
  let result = html;
  cadViews.forEach((v, i) => {
    const tag = `<div data-type="cad-view-embed" data-mode="${v.mode}" data-url="${v.url}"></div>`;
    const ph = `%%CADVIEW_${i}%%`;
    result = result.replace(`<p>${ph}</p>`, tag);
    result = result.split(ph).join(tag);
  });
  return result;
}

// ─── InfoMark inline embed ──────────────────────────────────────────────────
// Format: @[info:{encodedText}:{encodedTitle}:{encodedBody}:{encodedBodyPath}]
// — four URL-encoded segments joined by ':'. Older 3-segment infomarks
// (without bodyPath) parse correctly too (4th segment defaults to '').
// Encoding each segment individually means colons, brackets, newlines and
// slashes (paths!) in any segment don't break the bracket-paired syntax.
function escapeInfoMarksForHtml(content: string): string {
  const infoMarks: { text: string; title: string; body: string; bodyPath: string }[] = [];
  const result = content.replace(/@\[info:([^\]]+)\]/g, (_, params: string) => {
    const parts = params.split(':');
    const dec = (s: string | undefined) => {
      if (!s) return '';
      try { return decodeURIComponent(s); } catch { return s; }
    };
    infoMarks.push({
      text:     dec(parts[0]),
      title:    dec(parts[1]),
      body:     dec(parts[2]),
      bodyPath: dec(parts[3]),
    });
    return `%%INFOMARK_${infoMarks.length - 1}%%`;
  });
  return JSON.stringify({ result, infoMarks });
}

function restoreInfoMarksFromHtml(
  html: string,
  infoMarks: { text: string; title: string; body: string; bodyPath: string }[],
): string {
  let result = html;
  infoMarks.forEach((m, i) => {
    // Both data-text AND inner text so a non-TipTap renderer (raw markdown
    // preview, search) still shows the visible label. data-text is canonical.
    const tag = `<span data-type="info-mark"`
      + ` data-text="${encodeURIComponent(m.text)}"`
      + ` data-title="${encodeURIComponent(m.title)}"`
      + ` data-body="${encodeURIComponent(m.body)}"`
      + ` data-body-path="${encodeURIComponent(m.bodyPath)}">`
      // Escape HTML-significant chars in the visible text so a "<" in a
      // user-typed marker doesn't get interpreted as a tag during the
      // showdown → TipTap reparse.
      + m.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      + `</span>`;
    const ph = `%%INFOMARK_${i}%%`;
    // InfoMark is INLINE — no `<p>${ph}</p>` wrapping cleanup needed; just
    // splice the raw placeholder wherever showdown left it inside <p>/<li>.
    result = result.split(ph).join(tag);
  });
  return result;
}

// Helper to escape form-engine embeds (@[form:path]) to protect them from showdown
function escapeFormEngineEmbedsForHtml(content: string): string {
  const formEmbeds: string[] = [];
  const result = content.replace(/@\[form:([^\]]+)\]/g, (_, path) => {
    formEmbeds.push(path.trim());
    return `%%FORMEMBED_${formEmbeds.length - 1}%%`;
  });
  return JSON.stringify({ result, formEmbeds });
}

// Helper to restore form-engine embeds after showdown conversion
function restoreFormEngineEmbedsFromHtml(html: string, formEmbeds: string[]): string {
  let result = html;
  formEmbeds.forEach((path, index) => {
    const htmlTag = `<div data-type="form-engine-embed" data-form-path="${path}"></div>`;
    const placeholder = `%%FORMEMBED_${index}%%`;
    result = result.replace(`<p>${placeholder}</p>`, htmlTag);
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

// Preserve relative hrefs — DOMParser resolves relative URLs to absolute,
// but getAttribute('href') returns the original attribute value.
// We use it explicitly to avoid losing relative workspace links.
turndownService.addRule('links', {
  filter: (node) => node.nodeName === 'A' && !!(node as HTMLAnchorElement).getAttribute('href'),
  replacement: (content, node) => {
    const href = (node as HTMLAnchorElement).getAttribute('href') ?? '';
    const title = (node as HTMLAnchorElement).getAttribute('title');
    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : '';
    return `[${content}](${href}${titlePart})`;
  },
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

// InfoMark inline span — covers the cases where the pre-processor regex
// missed (e.g. extra attributes inside the tag perturbed the placeholder
// swap). Defensive: emits the same @[info:...] syntax the placeholder
// pipeline would have, so the round-trip works either way.
turndownService.addRule('infoMark', {
  filter: (node) => {
    const el = node as HTMLElement;
    return el.tagName === 'SPAN' && el.getAttribute('data-type') === 'info-mark';
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const dec = (s: string | null) => {
      if (!s) return '';
      try { return decodeURIComponent(s); } catch { return s; }
    };
    const text     = dec(el.getAttribute('data-text'))  || el.textContent || '';
    const title    = dec(el.getAttribute('data-title'));
    const body     = dec(el.getAttribute('data-body'));
    const bodyPath = dec(el.getAttribute('data-body-path'));
    return `@[info:${encodeURIComponent(text)}:${encodeURIComponent(title)}:${encodeURIComponent(body)}:${encodeURIComponent(bodyPath)}]`;
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

// Automate flow embed rule - converts back to @[automate:id] or @[automate:id:autorun] syntax
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
    let autorun = element.getAttribute('data-autorun') === 'true';

    if (!flowId) {
      const inner = element.querySelector('[data-type="automate-flow-embed"]');
      if (inner) {
        flowId = inner.getAttribute('data-flow-id') || '';
        autorun = inner.getAttribute('data-autorun') === 'true';
      }
    }

    return flowId ? `\n@[automate:${flowId}${autorun ? ':autorun' : ''}]\n` : '';
  },
});

// Automate script block rule - converts back to ```automate code fence
// Format: ```automate, ```automate:blockId, ```automate::autorun, ```automate:blockId:autorun
// Round-trip the EventBlock TipTap node back to a `event` code fence with
// JSON attrs so the markdown file on disk stays the single source of truth.
// Mirrors automateScriptBlock — handles both bare <div data-type="event-block">
// and TipTap's NodeViewWrapper-wrapped form.
turndownService.addRule('eventBlock', {
  filter: (node) => {
    const element = node as HTMLElement;
    if (element.getAttribute && element.getAttribute('data-type') === 'event-block') return true;
    if (element.getAttribute && element.getAttribute('data-node-view-wrapper') !== null) {
      const inner = element.querySelector('[data-type="event-block"]');
      if (inner) return true;
    }
    return false;
  },
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    const source: HTMLElement = element.getAttribute('data-type') === 'event-block'
      ? element
      : (element.querySelector('[data-type="event-block"]') as HTMLElement | null) ?? element;
    const dec = (name: string) => {
      const raw = source.getAttribute(name);
      if (!raw) return '';
      try { return decodeURIComponent(raw); } catch { return raw; }
    };
    const attrs = {
      eventName:   dec('data-event-name'),
      start:       dec('data-start'),
      end:         dec('data-end'),
      description: dec('data-description'),
      taskId:      dec('data-task-id'),
      taskName:    dec('data-task-name'),
      projectName: dec('data-project-name'),
    };
    return `\n\`\`\`event\n${JSON.stringify(attrs, null, 2)}\n\`\`\`\n`;
  },
});

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
    let autorun = element.getAttribute('data-autorun') === 'true';
    let viewMode = element.getAttribute('data-view-mode') === 'html' ? 'html' : 'code';
    let tagsRaw = element.getAttribute('data-tags') || '';
    let windowHeightRaw = element.getAttribute('data-window-height') || '';

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
        autorun = inner.getAttribute('data-autorun') === 'true';
        viewMode = inner.getAttribute('data-view-mode') === 'html' ? 'html' : 'code';
        tagsRaw = inner.getAttribute('data-tags') || tagsRaw;
        windowHeightRaw = inner.getAttribute('data-window-height') || windowHeightRaw;
      }
    }

    // Build lang tag — collect optional flags into an array and join. Order
    // is stable so a script saved as `automate:id:autorun:html:t=…` parses
    // back identically (the parser uses `parts.includes(flag)` so order is
    // in fact irrelevant, but stability keeps diffs clean).
    const parts: string[] = ['automate'];
    parts.push(blockId);            // may be empty — becomes `automate::…`
    if (autorun) parts.push('autorun');
    if (viewMode === 'html') parts.push('html');
    // Tags get their own `t=` prefix so the escape parser can find them
    // without ambiguity vs `autorun` / `html` flag tokens. Empty tag list
    // skips the token entirely so unchanged docs don't accumulate `:t=`.
    if (tagsRaw) {
      // tagsRaw is already comma-joined URL-encoded values from renderHTML;
      // pass it through unchanged so we don't double-encode.
      parts.push(`t=${tagsRaw}`);
    }
    if (windowHeightRaw) {
      // windowHeightRaw is a plain integer string from data-window-height —
      // pass through verbatim; the parser validates on the way back in.
      parts.push(`h=${windowHeightRaw}`);
    }
    // Trim trailing empties so `automate::` (no flags, no id) stays plain `automate`.
    while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
    const langTag = parts.join(':');

    return `\n\`\`\`${langTag}\n${code}\n\`\`\`\n`;
  },
});

// Plugin script block helpers — format: ```pscript:blockId:mode:encodedLabel
type PluginScriptEntry = { code: string; blockId: string; mode: string; label: string };

function escapePluginScriptsForHtml(content: string): string {
  const scripts: PluginScriptEntry[] = [];
  const result = content.replace(/```pscript(?::([^\n]*))?\n([\s\S]*?)```/g, (_, params, code) => {
    const parts = (params?.trim() || '').split(':');
    const blockId = parts[0] || '';
    const mode = parts[1] || 'manual';
    const label = parts[2] ? decodeURIComponent(parts[2]) : 'Script';
    scripts.push({ code: code.trimEnd(), blockId, mode, label });
    return `%%PLUGINSCRIPT_${scripts.length - 1}%%`;
  });
  return JSON.stringify({ result, scripts });
}

function restorePluginScriptsFromHtml(html: string, scripts: PluginScriptEntry[]): string {
  let result = html;
  scripts.forEach((s, index) => {
    const blockIdAttr = s.blockId ? ` data-block-id="${s.blockId}"` : '';
    const tag = `<div data-type="plugin-script-block"${blockIdAttr} data-mode="${s.mode}" data-label="${s.label}" data-collapsed="false" data-code="${encodeURIComponent(s.code)}"></div>`;
    const ph = `%%PLUGINSCRIPT_${index}%%`;
    result = result.replace(`<p>${ph}</p>`, tag);
    result = result.split(ph).join(tag);
  });
  return result;
}

// Plugin script block rule — converts back to ```pscript code fence
turndownService.addRule('pluginScriptBlock', {
  filter: (node) => {
    const el = node as HTMLElement;
    if (el.getAttribute('data-type') === 'plugin-script-block') return true;
    if (el.getAttribute('data-node-view-wrapper') !== null) {
      return !!el.querySelector('[data-type="plugin-script-block"]');
    }
    return false;
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    let target: HTMLElement = el;
    if (!target.getAttribute('data-type')) {
      const inner = target.querySelector('[data-type="plugin-script-block"]') as HTMLElement | null;
      if (inner) target = inner;
    }
    const code = target.getAttribute('data-code') ? decodeURIComponent(target.getAttribute('data-code')!) : '';
    const blockId = target.getAttribute('data-block-id') || '';
    const mode = target.getAttribute('data-mode') || 'manual';
    const label = encodeURIComponent(target.getAttribute('data-label') || 'Script');
    const params = [blockId, mode, label].join(':');
    return `\n\`\`\`pscript:${params}\n${code}\n\`\`\`\n`;
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

  // Strip any stray %%BID:xxx%% literals that may appear in files saved by old/broken code
  markdown = markdown.replace(/%%BID:[^%\n]*%%\n?/g, '');

  // Protect <!-- bid:id --> block ID markers from showdown processing
  // Accept any ID format (UUID or legacy slug)
  const blockIds: string[] = [];
  const markdownWithBlockIds = markdown.replace(
    /^<!--\s*bid:([^\s>-][^\s>]*)?\s*-->[ \t]*$/gm,
    (_, id) => {
      if (!id) return '';
      const ph = `%%BID${blockIds.length}%%`;
      blockIds.push(id);
      return ph;
    },
  );

  // First, protect plugin script blocks from showdown processing
  const pluginScriptDataStr = escapePluginScriptsForHtml(markdownWithBlockIds);
  const { result: markdownWithoutPluginScripts, scripts: pluginScripts } = JSON.parse(pluginScriptDataStr);

  // Protect event blocks (```event {…json…}``` code fences) from showdown
  // — same pattern as automate scripts: replace with `%%EVENTBLOCK_N%%`
  // marker, then re-emit as <div data-type="event-block" data-…> after html.
  const { result: markdownWithoutEvents, events: eventBlocks } =
    escapeEventBlocksForHtml(markdownWithoutPluginScripts);

  // Protect automate script blocks (code fences) from showdown processing
  const automateScriptDataStr = escapeAutomateScriptsForHtml(markdownWithoutEvents);
  const { result: markdownWithoutScripts, automateScripts } = JSON.parse(automateScriptDataStr);

  // Protect automate flow embeds from showdown processing
  const automateFlowDataStr = escapeAutomateFlowsForHtml(markdownWithoutScripts);
  const { result: markdownWithoutFlows, automateFlows } = JSON.parse(automateFlowDataStr);

  // Protect UI form embeds from showdown processing
  const uiFormDataStr = escapeUIFormsForHtml(markdownWithoutFlows);
  const { result: markdownWithoutUIForms, uiForms } = JSON.parse(uiFormDataStr);

  // Protect CAD view embeds from showdown processing
  const cadViewDataStr = escapeCadViewEmbedsForHtml(markdownWithoutUIForms);
  const { result: markdownWithoutCadViews, cadViews } = JSON.parse(cadViewDataStr);

  // Protect form-engine embeds from showdown processing
  const formEngineDataStr = escapeFormEngineEmbedsForHtml(markdownWithoutCadViews);
  const { result: markdownWithoutFormEngine, formEmbeds } = JSON.parse(formEngineDataStr);

  // Protect InfoMark inline embeds from showdown processing
  const infoMarkDataStr = escapeInfoMarksForHtml(markdownWithoutFormEngine);
  const { result: markdownWithoutInfoMarks, infoMarks } = JSON.parse(infoMarkDataStr) as {
    result: string;
    infoMarks: { text: string; title: string; body: string; bodyPath: string }[];
  };

  // Then, protect component embeds from showdown processing
  const componentDataStr = escapeComponentEmbedsForHtml(markdownWithoutInfoMarks);
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

  // Restore CAD view embeds
  html = restoreCadViewEmbedsFromHtml(html, cadViews);

  // Restore form-engine embeds
  html = restoreFormEngineEmbedsFromHtml(html, formEmbeds);

  // Restore InfoMark inline embeds
  html = restoreInfoMarksFromHtml(html, infoMarks);

  // Restore automate flow embeds
  html = restoreAutomateFlowsFromHtml(html, automateFlows);

  // Restore automate script blocks
  html = restoreAutomateScriptsFromHtml(html, automateScripts);

  // Restore event blocks (insert <div data-type="event-block" data-…>)
  html = restoreEventBlocksFromHtml(html, eventBlocks);

  // Restore plugin script blocks
  html = restorePluginScriptsFromHtml(html, pluginScripts);

  html = html.replace(
    /<li>\s*\[([ xX])\]\s*/g,
    (_, checked) => {
      const isChecked = checked.toLowerCase() === 'x';
      return `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox"${isChecked ? ' checked' : ''}></label><div>`;
    }
  );

  html = html.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  // Restore block IDs: apply each %%BIDn%% placeholder's UUID to the next block tag
  if (blockIds.length > 0) {
    // Placeholders may be wrapped in <p> by showdown
    blockIds.forEach((id, i) => {
      html = html
        .replace(`<p>%%BID${i}%%</p>`, `%%BIDREADY:${id}%%`)
        .replace(`%%BID${i}%%`, `%%BIDREADY:${id}%%`);
    });
    html = html.replace(
      /%%BIDREADY:([^%]+)%%\s*(<(?:h[1-6]|p|ul|ol|blockquote|pre|table)[^>]*>)/gi,
      (_, id, openTag) => openTag.replace(/^(<\w+)/, `$1 data-block-id="${id}"`),
    );
    html = html.replace(/%%BIDREADY:[^%]*%%/g, '');
  }

  return html;
}

export function htmlToMarkdown(html: string): string {
  if (!html || html.trim() === '' || html === '<p></p>') {
    return '';
  }

  // Pre-process: extract data-block-id from top-level blocks and insert text placeholders
  // (empty divs are skipped by Turndown's isBlank check, so we use <p> with text content)
  let processedHtml = (() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    Array.from(doc.body.children).forEach((el) => {
      const id = el.getAttribute('data-block-id');
      if (id) {
        el.removeAttribute('data-block-id');
        const marker = doc.createElement('p');
        marker.textContent = `%%BID:${id}%%`;
        doc.body.insertBefore(marker, el);
      }
    });
    return doc.body.innerHTML;
  })();

  // Pre-process: Replace UI form embeds with placeholders before Turndown
  const uiForms: { id: string; inline?: string }[] = [];

  processedHtml = processedHtml.replace(
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

  // Pre-process: Replace form-engine embeds with placeholders before Turndown
  const formEngineEmbeds: string[] = [];

  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="form-engine-embed"[^>]*data-form-path="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (_, path) => {
      formEngineEmbeds.push(path);
      return `##FORMEMBED${formEngineEmbeds.length - 1}##`;
    },
  );

  // Also handle self-closing variant
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="form-engine-embed"[^>]*data-form-path="([^"]*)"[^>]*\/>/gi,
    (_, path) => {
      formEngineEmbeds.push(path);
      return `##FORMEMBED${formEngineEmbeds.length - 1}##`;
    },
  );

  // Pre-process: Replace CAD view embeds with placeholders before Turndown
  const cadViews: { mode: string; url: string }[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="cad-view-embed"[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      const modeM = match.match(/data-mode="([^"]*)"/);
      const urlM  = match.match(/data-url="([^"]*)"/);
      cadViews.push({ mode: modeM?.[1] || 'scene3d', url: urlM?.[1] || '' });
      return `##CADVIEW${cadViews.length - 1}##`;
    },
  );

  // Pre-process: Replace InfoMark inline spans with placeholders before
  // Turndown — span is inline so the regex matches without consuming a
  // surrounding paragraph; placeholder gets swapped back to @[info:…]
  // post-Turndown.
  const infoMarks: { text: string; title: string; body: string; bodyPath: string }[] = [];
  processedHtml = processedHtml.replace(
    /<span[^>]*data-type="info-mark"[^>]*>[\s\S]*?<\/span>/gi,
    (match) => {
      const dec = (s: string | undefined) => {
        if (!s) return '';
        try { return decodeURIComponent(s); } catch { return s; }
      };
      const textM  = match.match(/data-text="([^"]*)"/);
      const titleM = match.match(/data-title="([^"]*)"/);
      const bodyM  = match.match(/data-body="([^"]*)"/);
      const pathM  = match.match(/data-body-path="([^"]*)"/);
      infoMarks.push({
        text:     dec(textM?.[1]),
        title:    dec(titleM?.[1]),
        body:     dec(bodyM?.[1]),
        bodyPath: dec(pathM?.[1]),
      });
      return `##INFOMARK${infoMarks.length - 1}##`;
    },
  );

  // Pre-process: Replace automate flow embeds with placeholders before Turndown
  const automateFlows: { id: string; autorun: boolean }[] = [];

  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="automate-flow-embed"[^>]*data-flow-id="([^"]*)"[^>]*>[\s\S]*?<\/div>/gi,
    (match, flowId) => {
      const autorunMatch = match.match(/data-autorun="([^"]*)"/);
      const autorun = autorunMatch ? autorunMatch[1] === 'true' : false;
      automateFlows.push({ id: flowId, autorun });
      return `##AUTOMATEFLOW${automateFlows.length - 1}##`;
    }
  );

  // Pre-process: Replace plugin script blocks with placeholders before Turndown
  const pluginScriptsHtml: PluginScriptEntry[] = [];
  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="plugin-script-block"[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      const codeM = match.match(/data-code="([^"]*)"/);
      const blockIdM = match.match(/data-block-id="([^"]*)"/);
      const modeM = match.match(/data-mode="([^"]*)"/);
      const labelM = match.match(/data-label="([^"]*)"/);
      pluginScriptsHtml.push({
        code: codeM ? decodeURIComponent(codeM[1]) : '',
        blockId: blockIdM ? blockIdM[1] : '',
        mode: modeM ? modeM[1] : 'manual',
        label: labelM ? labelM[1] : 'Script',
      });
      return `##PLUGINSCRIPT${pluginScriptsHtml.length - 1}##`;
    },
  );

  // Pre-process: Replace automate script blocks with placeholders before Turndown
  const automateScripts: { code: string; blockId: string; autorun: boolean; viewMode: 'code' | 'html'; tagsRaw: string; windowHeightRaw: string }[] = [];

  processedHtml = processedHtml.replace(
    /<div[^>]*data-type="automate-script-block"[^>]*?(?:data-block-id="([^"]*)")?[^>]*?(?:data-code="([^"]*)")?[^>]*>[\s\S]*?<\/div>/gi,
    (match) => {
      const codeMatch = match.match(/data-code="([^"]*)"/);
      const blockIdMatch = match.match(/data-block-id="([^"]*)"/);
      const autorunMatch = match.match(/data-autorun="([^"]*)"/);
      const viewModeMatch = match.match(/data-view-mode="([^"]*)"/);
      const tagsMatch = match.match(/data-tags="([^"]*)"/);
      const whMatch = match.match(/data-window-height="([^"]*)"/);
      automateScripts.push({
        code: codeMatch ? decodeURIComponent(codeMatch[1]) : '',
        blockId: blockIdMatch ? blockIdMatch[1] : '',
        autorun: autorunMatch ? autorunMatch[1] === 'true' : false,
        viewMode: (viewModeMatch && viewModeMatch[1] === 'html') ? 'html' : 'code',
        // tagsRaw is the already-encoded `a,b,c` string; we keep it raw so
        // it can be plugged into the `t=` token without double-encoding.
        tagsRaw: tagsMatch ? tagsMatch[1] : '',
        windowHeightRaw: whMatch ? whMatch[1] : '',
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

  // Post-process: replace %%BID:id%% text placeholders with <!-- bid:id --> comments
  // Accept any ID format (UUID or legacy slug) so old documents round-trip correctly
  markdown = markdown.replace(/%%BID:([^%\n]+)%%/g, (_, id) => `<!-- bid:${id} -->`);

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

  // Post-process: Restore form-engine embeds as @[form:path] syntax
  formEngineEmbeds.forEach((path, index) => {
    const placeholder = `##FORMEMBED${index}##`;
    const replacement = path ? `@[form:${path}]` : '';
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore automate flow embeds as @[automate:id] or @[automate:id:autorun] syntax
  automateFlows.forEach((flow, index) => {
    const placeholder = `##AUTOMATEFLOW${index}##`;
    const replacement = flow.id ? `@[automate:${flow.id}${flow.autorun ? ':autorun' : ''}]` : '';
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore CAD view embeds as @[cad:mode:https://server/viewer/...]
  cadViews.forEach((v, index) => {
    const placeholder = `##CADVIEW${index}##`;
    const replacement = `@[cad:${v.mode}:${v.url}]`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore InfoMark inline embeds as
  // @[info:text:title:body:bodyPath], each segment URL-encoded so colons /
  // brackets / newlines / slashes don't collide with the @[…] bracket parser.
  infoMarks.forEach((m, index) => {
    const placeholder = `##INFOMARK${index}##`;
    const enc = (s: string) => encodeURIComponent(s);
    const replacement = `@[info:${enc(m.text)}:${enc(m.title)}:${enc(m.body)}:${enc(m.bodyPath)}]`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore plugin script blocks as ```pscript code fences
  pluginScriptsHtml.forEach((s, index) => {
    const placeholder = `##PLUGINSCRIPT${index}##`;
    const label = encodeURIComponent(s.label);
    const replacement = `\n\`\`\`pscript:${s.blockId}:${s.mode}:${label}\n${s.code}\n\`\`\`\n`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  // Post-process: Restore automate script blocks as ```automate code fences
  // Format: automate[:blockId][:autorun][:html][:t=a,b]
  // Tokens are order-stable so diffs stay clean; the parser tolerates any
  // order via `parts.includes(...)`.
  automateScripts.forEach((script, index) => {
    const placeholder = `##AUTOMATESCRIPT${index}##`;
    const parts: string[] = ['automate', script.blockId || ''];
    if (script.autorun) parts.push('autorun');
    if (script.viewMode === 'html') parts.push('html');
    if (script.tagsRaw) parts.push(`t=${script.tagsRaw}`);
    if (script.windowHeightRaw) parts.push(`h=${script.windowHeightRaw}`);
    while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
    const langTag = parts.join(':');
    const replacement = `\n\`\`\`${langTag}\n${script.code}\n\`\`\`\n`;
    markdown = markdown.split(placeholder).join(replacement);
  });

  return markdown;
}
