/**
 * Agent engine — agentic tool-calling loop over VFS.
 */

import type { FileSystemProvider } from '@mhersztowski/core';
import type { AiProvider, AiProviderConfig, AiChatMessage, AiContentBlock, AgentMessage, ChatAttachment } from '../types';
import { buildVfsToolDefinitions } from '../tools/vfsTools';
import { executeVfsTool } from '../tools/toolExecutor';
import { buildWebToolDefinitions, executeWebTool } from '../tools/webTools';

export interface AgentEngineCallbacks {
  onMessage: (message: AgentMessage) => void;
  onProcessingChange: (processing: boolean) => void;
}

export class AgentEngine {
  private history: AgentMessage[] = [];
  private nextId = 1;
  private allAffectedFiles = new Set<string>();

  private aiProvider: AiProvider;
  private config: AiProviderConfig;
  private maxIterations: number;
  private temperature: number;
  private maxTokens: number;

  private claudeMdContent = '';
  private claudeMdLoaded = false;
  private abortController: AbortController | null = null;
  private skills = new Map<string, string>(); // name → content
  private webFetchUrl: string | null = null;
  private authToken: string | null = null;

  constructor(
    private provider: FileSystemProvider,
    private callbacks: AgentEngineCallbacks,
    aiProvider: AiProvider,
    config: AiProviderConfig,
    maxIterations = 15,
    temperature = 0.2,
    maxTokens = 4096,
    webFetchUrl?: string,
    authToken?: string,
  ) {
    this.aiProvider = aiProvider;
    this.config = config;
    this.maxIterations = maxIterations;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.webFetchUrl = webFetchUrl ?? null;
    this.authToken = authToken ?? null;
  }

  updateConfig(
    aiProvider: AiProvider,
    config: AiProviderConfig,
    maxIterations?: number,
    temperature?: number,
    maxTokens?: number,
    webFetchUrl?: string,
    authToken?: string,
  ): void {
    this.aiProvider = aiProvider;
    this.config = config;
    if (maxIterations !== undefined) this.maxIterations = maxIterations;
    if (temperature !== undefined) this.temperature = temperature;
    if (maxTokens !== undefined) this.maxTokens = maxTokens;
    if (webFetchUrl !== undefined) this.webFetchUrl = webFetchUrl;
    if (authToken !== undefined) this.authToken = authToken;
  }

  /** Scans VFS root dirs for CLAUDE.md + skills (skills-lock.json + .claude/commands/). */
  private async loadClaudeMd(): Promise<void> {
    this.claudeMdLoaded = true;
    const sections: string[] = [];
    this.skills.clear();

    let dirs: string[] = ['/'];
    try {
      const rootEntries = await this.provider.readDirectory('/');
      dirs = ['/', ...rootEntries.filter(e => e.type === 2).map(e => `/${e.name}`)];
      console.log('[AgentEngine] VFS root dirs:', dirs);
    } catch (e) { console.warn('[AgentEngine] readDirectory("/") failed:', e); }

    for (const dir of dirs) {
      const base = dir === '/' ? '' : dir;

      // CLAUDE.md
      try {
        const text = new TextDecoder().decode(await this.provider.readFile(`${base}/CLAUDE.md`));
        sections.push(`### ${base}/CLAUDE.md\n${text.trim()}`);
      } catch { /* not found */ }

      // Local skills: .claude/commands/*.md
      try {
        const cmdEntries = await this.provider.readDirectory(`${base}/.claude/commands`);
        for (const entry of cmdEntries) {
          if (!entry.name.endsWith('.md')) continue;
          const skillName = entry.name.replace(/\.md$/, '');
          try {
            const content = new TextDecoder().decode(
              await this.provider.readFile(`${base}/.claude/commands/${entry.name}`),
            );
            this.skills.set(skillName, content);
          } catch { /* skip */ }
        }
      } catch { /* no commands dir */ }

      // skills-lock.json — fetch from GitHub
      try {
        const lockText = new TextDecoder().decode(await this.provider.readFile(`${base}/skills-lock.json`));
        console.log(`[AgentEngine] Found skills-lock.json at ${base}/skills-lock.json`);
        const lock = JSON.parse(lockText) as {
          version: number;
          skills: Record<string, { source: string; sourceType: string }>;
        };
        for (const [skillName, def] of Object.entries(lock.skills ?? {})) {
          if (def.sourceType !== 'github') continue;
          const [owner, repo] = def.source.split('/');
          if (!owner || !repo) continue;
          // Try multiple paths and branches
          const urls = [
            `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillName}/SKILL.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/master/skills/${skillName}/SKILL.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillName}.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/main/skills/${skillName}.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/master/${skillName}.md`,
            `https://raw.githubusercontent.com/${owner}/${repo}/master/skills/${skillName}.md`,
          ];
          let loaded = false;
          // First try known URL patterns
          for (const url of urls) {
            try {
              const res = await fetch(url);
              if (res.ok) {
                this.skills.set(skillName, await res.text());
                console.log(`[AgentEngine] Skill ${skillName} loaded from ${url}`);
                loaded = true;
                break;
              }
            } catch { /* try next */ }
          }
          // Fallback: use GitHub Trees API to find the .md file anywhere in the repo
          if (!loaded) {
            try {
              for (const branch of ['main', 'master']) {
                const treeRes = await fetch(
                  `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
                );
                if (!treeRes.ok) continue;
                const tree = await treeRes.json() as { tree: Array<{ path: string; type: string }> };
                const match = tree.tree.find(
                  f => f.type === 'blob' && (
                    f.path === `skills/${skillName}/SKILL.md` ||
                    f.path === `${skillName}.md` ||
                    f.path.endsWith(`/${skillName}/SKILL.md`) ||
                    f.path.endsWith(`/${skillName}.md`)
                  ),
                );
                if (match) {
                  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${match.path}`;
                  const rawRes = await fetch(rawUrl);
                  if (rawRes.ok) {
                    this.skills.set(skillName, await rawRes.text());
                    console.log(`[AgentEngine] Skill ${skillName} loaded via tree API from ${rawUrl}`);
                    loaded = true;
                    break;
                  }
                }
              }
            } catch (e) { console.warn(`[AgentEngine] Tree API fallback failed:`, e); }
          }
          if (!loaded) console.warn(`[AgentEngine] Could not load skill: ${skillName}`);
        }
      } catch { /* no skills-lock.json */ }
    }

    this.claudeMdContent = sections.join('\n\n');
  }

  getSkills(): Map<string, string> {
    return this.skills;
  }

  abort(): void {
    this.abortController?.abort();
  }

  async initialize(): Promise<void> {
    if (!this.claudeMdLoaded) await this.loadClaudeMd();
  }

  async refreshSkills(): Promise<void> {
    this.claudeMdLoaded = false;
    this.claudeMdContent = '';
    this.skills.clear();
    await this.loadClaudeMd();
  }

  async process(userMessage: string, attachments?: ChatAttachment[]): Promise<void> {
    if (!this.claudeMdLoaded) await this.loadClaudeMd();
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    this.callbacks.onProcessingChange(true);
    try {
      const userMsg = this.createMessage('user', userMessage);
      if (attachments?.length) userMsg.attachments = attachments;
      this.history.push(userMsg);
      this.callbacks.onMessage(userMsg);

      const tools = [
        ...buildVfsToolDefinitions(this.provider),
        ...(this.webFetchUrl ? buildWebToolDefinitions() : []),
      ];
      const systemPrompt = this.buildSystemPrompt();

      let iteration = 0;
      while (iteration < this.maxIterations) {
        if (signal.aborted) break;
        iteration++;
        const messages = this.buildAiMessages(systemPrompt);

        const response = await this.aiProvider.chat({
          messages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          signal,
        }, this.config);

        if (response.toolCalls?.length) {
          // Assistant wants to use tools
          const assistantMsg = this.createMessage('assistant', response.content || '');
          assistantMsg.toolCalls = response.toolCalls;
          this.history.push(assistantMsg);
          this.callbacks.onMessage(assistantMsg);

          for (const toolCall of response.toolCalls) {
            if (signal.aborted) break;
            let result: string;
            let affectedFiles: string[];
            if (toolCall.function.name === 'web_fetch' && this.webFetchUrl) {
              const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
              result = await executeWebTool(toolCall.function.name, args, this.webFetchUrl, this.authToken ?? undefined);
              affectedFiles = [];
            } else {
              ({ result, affectedFiles } = await executeVfsTool(toolCall, this.provider));
            }
            for (const f of affectedFiles) this.allAffectedFiles.add(f);

            const toolMsg = this.createMessage('tool', result);
            toolMsg.toolCallId = toolCall.id;
            toolMsg.toolName = toolCall.function.name;
            toolMsg.affectedFiles = affectedFiles;
            this.history.push(toolMsg);
            this.callbacks.onMessage(toolMsg);
          }
        } else {
          // Final text response
          const assistantMsg = this.createMessage('assistant', response.content);
          assistantMsg.affectedFiles = [...this.allAffectedFiles];
          this.history.push(assistantMsg);
          this.callbacks.onMessage(assistantMsg);
          break;
        }
      }
    } finally {
      this.callbacks.onProcessingChange(false);
    }
  }

  getHistory(): AgentMessage[] {
    return [...this.history];
  }

  getAffectedFiles(): string[] {
    return [...this.allAffectedFiles];
  }

  clearHistory(): void {
    this.history = [];
    this.allAffectedFiles.clear();
    this.nextId = 1;
    this.claudeMdLoaded = false;
    this.claudeMdContent = '';
  }

  loadHistory(messages: AgentMessage[]): void {
    this.history = [...messages];
    this.nextId = messages.length + 1;
    this.allAffectedFiles.clear();
    for (const m of messages) {
      for (const f of m.affectedFiles ?? []) this.allAffectedFiles.add(f);
    }
  }

  private buildSystemPrompt(): string {
    const readOnly = this.provider.capabilities.readonly;
    const lines = [
      'You are an AI coding assistant embedded in a code editor with access to a virtual file system (VFS).',
      'You can read, search, and browse files using the provided VFS tools.',
      readOnly
        ? 'The file system is READ-ONLY. You cannot create, edit, or delete files.'
        : 'You can also create, edit, and delete files using the VFS tools.',
      'When asked about code, use the VFS tools to explore and understand the codebase before answering.',
      'When making changes, explain what you are doing and why.',
      'Always respond in the same language the user uses.',
      'Be concise and precise.',
    ];
    if (this.claudeMdContent) {
      lines.push('\n## Project instructions (from CLAUDE.md files)\n');
      lines.push(this.claudeMdContent);
    }
    if (this.skills.size > 0) {
      lines.push('\n## Installed skills (slash commands loaded from skills-lock.json)\n');
      lines.push('The following skills are installed and their full prompt content is available when invoked:');
      lines.push([...this.skills.keys()].map(k => `- /${k}`).join('\n'));
      lines.push('\nWhen the user types /skill-name, respond using that skill\'s instructions.');
    }
    return lines.join('\n');
  }

  private buildAiMessages(systemPrompt: string): AiChatMessage[] {
    const messages: AiChatMessage[] = [{ role: 'system', content: systemPrompt }];

    const slice = this.history.slice(-50);
    for (const msg of slice) {
      const aiMsg: AiChatMessage = { role: msg.role, content: msg.content };
      if (msg.toolCalls) aiMsg.tool_calls = msg.toolCalls;
      if (msg.toolCallId) aiMsg.tool_call_id = msg.toolCallId;
      // Rebuild multimodal content for user messages with attachments
      if (msg.role === 'user' && msg.attachments?.length) {
        const blocks: AiContentBlock[] = [];
        if (msg.content) blocks.push({ type: 'text', text: msg.content });
        for (const att of msg.attachments) {
          if (att.mimeType.startsWith('image/')) {
            blocks.push({ type: 'image_url', image_url: { url: att.dataUrl } });
          } else {
            // Non-image: inject as text block with filename header
            const base64 = att.dataUrl.split(',')[1] ?? '';
            try {
              const text = atob(base64);
              blocks.push({ type: 'text', text: `\n[File: ${att.name}]\n${text}` });
            } catch { /* skip undecodable */ }
          }
        }
        aiMsg.content = blocks;
      }
      messages.push(aiMsg);
    }
    return messages;
  }

  private createMessage(role: 'user' | 'assistant' | 'tool', content: string): AgentMessage {
    return {
      id: `agent-${this.nextId++}`,
      role,
      content,
      timestamp: Date.now(),
    };
  }
}
