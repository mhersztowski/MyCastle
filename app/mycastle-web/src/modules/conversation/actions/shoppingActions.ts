/**
 * Akcje konwersacyjne - zarządzanie listami zakupów
 */

import { DataSource } from '../../filesystem/data/DataSource';
import { mqttClient } from '../../mqttclient';
import { ShoppingItemModel, ShoppingListModel } from '@mhersztowski/core';
import { actionRegistry } from './ActionRegistry';
import { v4 as uuidv4 } from 'uuid';

const SHOPPING_PATH = 'data/shopping_lists.json';

function getShoppingData(dataSource: DataSource) {
  return dataSource.shoppingLists.map(l => l.toModel());
}

async function saveShoppingData(lists: ShoppingListModel[]): Promise<void> {
  const data = { type: 'shopping_lists', lists };
  await mqttClient.writeFile(SHOPPING_PATH, JSON.stringify(data, null, 2));
}

export function registerShoppingActions(dataSource: DataSource): void {
  actionRegistry.register({
    name: 'list_shopping_lists',
    description: 'Lista list zakupów. Opcjonalnie filtruj po statusie (active, completed, archived).',
    category: 'shopping',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filtr statusu: active, completed, archived' },
      },
    },
    handler: async (params) => {
      const status = params.status as string | undefined;
      let lists = dataSource.shoppingLists;
      if (status === 'active') lists = dataSource.getActiveShoppingLists();
      else if (status === 'completed') lists = dataSource.getCompletedShoppingLists();

      return lists.map(l => ({
        id: l.id,
        name: l.name,
        store: l.store,
        status: l.status,
        progress: l.getProgressText(),
        itemCount: l.items.length,
        estimatedTotal: l.getEstimatedTotal(),
      }));
    },
  });

  actionRegistry.register({
    name: 'get_shopping_list',
    description: 'Pobierz szczegóły listy zakupów z produktami.',
    category: 'shopping',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID listy zakupów' },
      },
      required: ['id'],
    },
    handler: async (params) => {
      const list = dataSource.getShoppingListById(params.id as string);
      if (!list) return { error: 'Lista nie znaleziona' };
      return {
        ...list.toModel(),
        progress: list.getProgressText(),
        estimatedTotal: list.getEstimatedTotal(),
        actualTotal: list.getActualTotal(),
      };
    },
  });

  actionRegistry.register({
    name: 'create_shopping_list',
    description: 'Utwórz nową listę zakupów.',
    category: 'shopping',
    confirmation: true,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nazwa listy' },
        store: { type: 'string', description: 'Sklep (opcjonalny)' },
        budget: { type: 'number', description: 'Budżet w PLN (opcjonalny)' },
      },
      required: ['name'],
    },
    handler: async (params) => {
      const newList: ShoppingListModel = {
        type: 'shopping_list',
        id: uuidv4(),
        name: params.name as string,
        store: params.store as string | undefined,
        status: 'active',
        createdAt: new Date().toISOString(),
        budget: params.budget as number | undefined,
        items: [],
      };
      const lists = getShoppingData(dataSource);
      lists.push(newList);
      await saveShoppingData(lists);
      return { success: true, list: { id: newList.id, name: newList.name } };
    },
  });

  actionRegistry.register({
    name: 'add_shopping_item',
    description: 'Dodaj produkt do listy zakupów.',
    category: 'shopping',
    confirmation: true,
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'ID listy zakupów' },
        name: { type: 'string', description: 'Nazwa produktu' },
        quantity: { type: 'number', description: 'Ilość (opcjonalna)' },
        unit: { type: 'string', description: 'Jednostka: szt, kg, g, l, ml, opak (opcjonalna)' },
        category: { type: 'string', description: 'Kategoria: nabiał, pieczywo, mięso, warzywa, owoce, napoje, chemia, higiena, inne (opcjonalna)' },
        estimatedPrice: { type: 'number', description: 'Szacowana cena w PLN (opcjonalna)' },
      },
      required: ['listId', 'name'],
    },
    handler: async (params) => {
      const list = dataSource.getShoppingListById(params.listId as string);
      if (!list) return { error: 'Lista nie znaleziona' };

      const newItem: ShoppingItemModel = {
        type: 'shopping_item',
        id: uuidv4(),
        name: params.name as string,
        quantity: params.quantity as number | undefined,
        unit: params.unit as string | undefined,
        category: params.category as string | undefined,
        estimatedPrice: params.estimatedPrice as number | undefined,
        checked: false,
      };

      const lists = getShoppingData(dataSource);
      const targetList = lists.find(l => l.id === params.listId);
      if (!targetList) return { error: 'Lista nie znaleziona' };
      targetList.items.push(newItem);
      await saveShoppingData(lists);
      return { success: true, item: { id: newItem.id, name: newItem.name } };
    },
  });

  actionRegistry.register({
    name: 'check_shopping_item',
    description: 'Oznacz produkt jako kupiony.',
    category: 'shopping',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'ID listy' },
        itemId: { type: 'string', description: 'ID produktu' },
        actualPrice: { type: 'number', description: 'Rzeczywista cena (opcjonalna)' },
      },
      required: ['listId', 'itemId'],
    },
    handler: async (params) => {
      const lists = getShoppingData(dataSource);
      const list = lists.find(l => l.id === params.listId);
      if (!list) return { error: 'Lista nie znaleziona' };
      const item = list.items.find(i => i.id === params.itemId);
      if (!item) return { error: 'Produkt nie znaleziony' };
      item.checked = true;
      if (params.actualPrice !== undefined) item.actualPrice = params.actualPrice as number;
      await saveShoppingData(lists);
      return { success: true };
    },
  });

  actionRegistry.register({
    name: 'uncheck_shopping_item',
    description: 'Odznacz produkt (nie kupiony).',
    category: 'shopping',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'ID listy' },
        itemId: { type: 'string', description: 'ID produktu' },
      },
      required: ['listId', 'itemId'],
    },
    handler: async (params) => {
      const lists = getShoppingData(dataSource);
      const list = lists.find(l => l.id === params.listId);
      if (!list) return { error: 'Lista nie znaleziona' };
      const item = list.items.find(i => i.id === params.itemId);
      if (!item) return { error: 'Produkt nie znaleziony' };
      item.checked = false;
      await saveShoppingData(lists);
      return { success: true };
    },
  });

  actionRegistry.register({
    name: 'remove_shopping_item',
    description: 'Usuń produkt z listy zakupów.',
    category: 'shopping',
    confirmation: true,
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'ID listy' },
        itemId: { type: 'string', description: 'ID produktu do usunięcia' },
      },
      required: ['listId', 'itemId'],
    },
    handler: async (params) => {
      const lists = getShoppingData(dataSource);
      const list = lists.find(l => l.id === params.listId);
      if (!list) return { error: 'Lista nie znaleziona' };
      const idx = list.items.findIndex(i => i.id === params.itemId);
      if (idx === -1) return { error: 'Produkt nie znaleziony' };
      list.items.splice(idx, 1);
      await saveShoppingData(lists);
      return { success: true, deletedId: params.itemId };
    },
  });

  actionRegistry.register({
    name: 'complete_shopping_list',
    description: 'Zakończ zakupy - zmień status listy na completed.',
    category: 'shopping',
    confirmation: true,
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'ID listy do zakończenia' },
      },
      required: ['listId'],
    },
    handler: async (params) => {
      const lists = getShoppingData(dataSource);
      const list = lists.find(l => l.id === params.listId);
      if (!list) return { error: 'Lista nie znaleziona' };
      list.status = 'completed';
      list.completedAt = new Date().toISOString();
      await saveShoppingData(lists);
      return { success: true };
    },
  });
}
