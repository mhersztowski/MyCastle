/**
 * UI Form Service - CRUD dla formularzy UI
 */

import { UIFormModel, UIFormsModel } from '../models';
import { UIFormNode } from '../nodes';
import { mqttClient } from '../../mqttclient';

const UI_FORMS_PATH = 'data/ui_forms.json';

export class UIFormService {
  private forms: Map<string, UIFormNode> = new Map();
  private isLoaded = false;
  private isLoading = false;

  /**
   * Załaduj wszystkie formularze z pliku
   */
  async loadForms(): Promise<UIFormNode[]> {
    if (this.isLoading) {
      // Czekaj na zakończenie ładowania
      while (this.isLoading) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return this.getAllForms();
    }

    this.isLoading = true;

    try {
      const file = await mqttClient.readFile(UI_FORMS_PATH);

      if (!file || !file.content) {
        this.isLoaded = true;
        this.isLoading = false;
        return [];
      }

      const data = JSON.parse(file.content) as UIFormsModel;

      this.forms.clear();
      if (data.forms) {
        for (const model of data.forms) {
          const node = UIFormNode.fromModel(model);
          this.forms.set(node.id, node);
        }
      }

      this.isLoaded = true;
      this.isLoading = false;
      return Array.from(this.forms.values());
    } catch (err) {
      console.error('Failed to load ui_forms.json:', err);
      this.isLoaded = true;
      this.isLoading = false;
      return [];
    }
  }

  /**
   * Pobierz formularz po ID
   */
  getFormById(id: string): UIFormNode | undefined {
    return this.forms.get(id);
  }

  /**
   * Pobierz wszystkie formularze
   */
  getAllForms(): UIFormNode[] {
    return Array.from(this.forms.values());
  }

  /**
   * Zapisz formularz
   */
  async saveForm(form: UIFormNode): Promise<boolean> {
    this.forms.set(form.id, form);
    form.markClean();
    return this.persistForms();
  }

  /**
   * Utwórz nowy formularz
   */
  async createForm(model: UIFormModel): Promise<UIFormNode> {
    const node = UIFormNode.fromModel(model);
    this.forms.set(node.id, node);
    await this.persistForms();
    return node;
  }

  /**
   * Usuń formularz
   */
  async deleteForm(id: string): Promise<boolean> {
    const deleted = this.forms.delete(id);
    if (deleted) {
      return this.persistForms();
    }
    return false;
  }

  /**
   * Sprawdź czy formularz istnieje
   */
  hasForm(id: string): boolean {
    return this.forms.has(id);
  }

  /**
   * Czy dane są załadowane
   */
  get loaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Zapisz wszystkie formularze do pliku
   */
  private async persistForms(): Promise<boolean> {
    const data: UIFormsModel = {
      type: 'ui_forms',
      forms: Array.from(this.forms.values()).map(node => node.toModel()),
    };

    try {
      await mqttClient.writeFile(UI_FORMS_PATH, JSON.stringify(data, null, 2));
      return true;
    } catch (err) {
      console.error('Failed to save ui_forms.json:', err);
      return false;
    }
  }

  /**
   * Parsuj inline JSON formularz z markdown
   */
  parseInlineForm(json: string): UIFormModel | null {
    try {
      const data = JSON.parse(json);
      if (data.type === 'ui_form') {
        return data as UIFormModel;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Wyszukaj formularze po nazwie
   */
  searchForms(query: string): UIFormNode[] {
    if (!query.trim()) {
      return this.getAllForms();
    }

    return Array.from(this.forms.values()).filter(form => form.matches(query));
  }

  /**
   * Duplikuj formularz
   */
  async duplicateForm(id: string, newId: string, newName?: string): Promise<UIFormNode | null> {
    const original = this.forms.get(id);
    if (!original) return null;

    const clone = original.clone();
    clone.id = newId;
    if (newName) {
      clone.name = newName;
    }

    this.forms.set(clone.id, clone);
    await this.persistForms();
    return clone;
  }

  /**
   * Wyczyść cache
   */
  clear(): void {
    this.forms.clear();
    this.isLoaded = false;
  }

  /**
   * Przeładuj formularze
   */
  async reload(): Promise<UIFormNode[]> {
    this.clear();
    return this.loadForms();
  }
}

// Singleton instance
export const uiFormService = new UIFormService();
