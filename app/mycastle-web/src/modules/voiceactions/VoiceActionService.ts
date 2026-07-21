/**
 * VoiceActionService - zarządzanie kolekcją akcji głosowych (voice actions)
 * i ich wariantów językowych (logika Blockly).
 *
 * Persistencja na SERWERZE (backend) przez REST:
 *   GET/PUT /api/users/{userName}/voice-actions
 * (plik data/Minis/Users/{userName}/VoiceActions/voice_actions.json po stronie backendu).
 */

import { minisApi } from '../../services/MinisApiService';
import {
  VoiceActionCollection,
  VoiceAction,
  VoiceActionVariant,
  DEFAULT_VOICE_ACTION_COLLECTION,
} from '@mhersztowski/core';

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class VoiceActionService {
  private data: VoiceActionCollection = { ...DEFAULT_VOICE_ACTION_COLLECTION };
  private _isLoaded = false;
  private _isLoading = false;
  private _userName = '';

  get loaded(): boolean {
    return this._isLoaded;
  }

  async loadConfig(userName: string): Promise<VoiceActionCollection> {
    this._userName = userName;
    if (this._isLoading) {
      while (this._isLoading) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return this.data;
    }
    this._isLoading = true;
    try {
      const parsed = await minisApi.getVoiceActions(userName);
      this.data = {
        type: 'voice_actions',
        actions: parsed?.actions ?? [],
        variants: parsed?.variants ?? [],
        wakeWords: parsed?.wakeWords ?? [],
        globalXml: parsed?.globalXml ?? '',
      };
      this._isLoaded = true;
      return this.data;
    } catch (err) {
      console.error('Failed to load voice actions from backend:', err);
      this._isLoaded = true;
      return this.data;
    } finally {
      this._isLoading = false;
    }
  }

  async saveConfig(userName?: string, data?: VoiceActionCollection): Promise<boolean> {
    if (userName) this._userName = userName;
    if (data) this.data = data;
    if (!this._userName) {
      console.error('VoiceActionService.saveConfig: brak userName');
      return false;
    }
    try {
      await minisApi.saveVoiceActions(this._userName, this.data);
      return true;
    } catch (err) {
      console.error('Failed to save voice actions to backend:', err);
      return false;
    }
  }

  getData(): VoiceActionCollection {
    return this.data;
  }

  // ----- CRUD akcji -----

  addAction(partial?: Partial<VoiceAction>): VoiceAction {
    const action: VoiceAction = {
      type: 'voice_action',
      id: uid('va'),
      name: partial?.name ?? 'Nowa akcja',
      tag: partial?.tag ?? '',
      activatorStrings: partial?.activatorStrings ?? [],
      activatorsSimilarStringsArray: partial?.activatorsSimilarStringsArray ?? [],
      language: partial?.language ?? 'pl',
    };
    this.data.actions = [...this.data.actions, action];
    // Utwórz domyślny wariant dla języka akcji
    this.addVariant(action.id, action.language);
    return action;
  }

  updateAction(id: string, patch: Partial<VoiceAction>): void {
    this.data.actions = this.data.actions.map(a => (a.id === id ? { ...a, ...patch, id: a.id } : a));
  }

  deleteAction(id: string): void {
    this.data.actions = this.data.actions.filter(a => a.id !== id);
    this.data.variants = this.data.variants.filter(v => v.voiceActionId !== id);
  }

  // ----- CRUD wariantów -----

  getVariants(voiceActionId: string): VoiceActionVariant[] {
    return this.data.variants.filter(v => v.voiceActionId === voiceActionId);
  }

  addVariant(voiceActionId: string, language: string, blocklyXml = ''): VoiceActionVariant {
    const variant: VoiceActionVariant = {
      id: uid('vav'),
      voiceActionId,
      language,
      blocklyXml,
    };
    this.data.variants = [...this.data.variants, variant];
    return variant;
  }

  updateVariant(id: string, patch: Partial<VoiceActionVariant>): void {
    this.data.variants = this.data.variants.map(v => (v.id === id ? { ...v, ...patch, id: v.id } : v));
  }

  deleteVariant(id: string): void {
    this.data.variants = this.data.variants.filter(v => v.id !== id);
  }
}

export const voiceActionService = new VoiceActionService();
