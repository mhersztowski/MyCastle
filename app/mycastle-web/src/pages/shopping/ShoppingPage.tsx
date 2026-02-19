import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Snackbar,
  Alert,
  CircularProgress,
  Paper,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Chip,
  Checkbox,
  IconButton,
  Tooltip,
  TextField,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  InputAdornment,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ArchiveIcon from '@mui/icons-material/Archive';
import StoreIcon from '@mui/icons-material/Store';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { useFilesystem } from '../../modules/filesystem';
import { aiService } from '../../modules/ai';
import { receiptScannerService } from '../../modules/shopping/services/ReceiptScannerService';
import ReceiptScanDialog from './ReceiptScanDialog';
import { ShoppingListModel, ShoppingListsModel, ShoppingItemModel } from '@mhersztowski/core';
import { DEFAULT_SHOPPING_CATEGORIES, DEFAULT_SHOPPING_UNITS } from '../../modules/filesystem/models/ShoppingModel';
import { PersonLabel } from '../../components/person';
import { v4 as uuidv4 } from 'uuid';

const SHOPPING_PATH = 'data/shopping_lists.json';

// ===== New List Dialog =====
interface NewListDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (list: ShoppingListModel) => void;
}

const NewListDialog: React.FC<NewListDialogProps> = ({ open, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [store, setStore] = useState('');
  const [budget, setBudget] = useState('');
  const [description, setDescription] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    const newList: ShoppingListModel = {
      type: 'shopping_list',
      id: uuidv4(),
      name: name.trim(),
      description: description.trim() || undefined,
      store: store.trim() || undefined,
      status: 'active',
      createdAt: new Date().toISOString(),
      budget: budget ? parseFloat(budget) : undefined,
      items: [],
    };
    onSave(newList);
    setName('');
    setStore('');
    setBudget('');
    setDescription('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Shopping List</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            size="small"
          />
          <TextField
            label="Store"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            size="small"
            placeholder="e.g. Biedronka, Lidl, Castorama"
          />
          <TextField
            label="Budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            size="small"
            type="number"
            InputProps={{
              endAdornment: <InputAdornment position="end">PLN</InputAdornment>,
            }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            size="small"
            multiline
            rows={2}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name.trim()}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ===== Add Item Dialog =====
interface AddItemDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (item: ShoppingItemModel) => void;
  favoriteItems: string[];
  allItemNames: string[];
  categories: string[];
  units: string[];
  editItem?: ShoppingItemModel | null;
}

const AddItemDialog: React.FC<AddItemDialogProps> = ({
  open, onClose, onSave, favoriteItems, allItemNames, categories, units, editItem,
}) => {
  const [name, setName] = useState(editItem?.name || '');
  const [quantity, setQuantity] = useState(editItem?.quantity?.toString() || '');
  const [unit, setUnit] = useState(editItem?.unit || '');
  const [category, setCategory] = useState(editItem?.category || '');
  const [estimatedPrice, setEstimatedPrice] = useState(editItem?.estimatedPrice?.toString() || '');
  const [actualPrice, setActualPrice] = useState(editItem?.actualPrice?.toString() || '');
  const [note, setNote] = useState(editItem?.note || '');

  React.useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setQuantity(editItem.quantity?.toString() || '');
      setUnit(editItem.unit || '');
      setCategory(editItem.category || '');
      setEstimatedPrice(editItem.estimatedPrice?.toString() || '');
      setActualPrice(editItem.actualPrice?.toString() || '');
      setNote(editItem.note || '');
    } else {
      setName('');
      setQuantity('');
      setUnit('');
      setCategory('');
      setEstimatedPrice('');
      setActualPrice('');
      setNote('');
    }
  }, [editItem, open]);

  const autocompleteOptions = useMemo(() => {
    const all = new Set([...favoriteItems, ...allItemNames]);
    return Array.from(all).sort();
  }, [favoriteItems, allItemNames]);

  const handleSave = () => {
    if (!name.trim()) return;
    const item: ShoppingItemModel = {
      type: 'shopping_item',
      id: editItem?.id || uuidv4(),
      name: name.trim(),
      quantity: quantity ? parseFloat(quantity) : undefined,
      unit: unit || undefined,
      category: category || undefined,
      estimatedPrice: estimatedPrice ? parseFloat(estimatedPrice) : undefined,
      actualPrice: actualPrice ? parseFloat(actualPrice) : undefined,
      checked: editItem?.checked || false,
      note: note.trim() || undefined,
      assignedPersonId: editItem?.assignedPersonId,
    };
    onSave(item);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editItem ? 'Edit Item' : 'Add Item'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Autocomplete
            freeSolo
            options={autocompleteOptions}
            value={name}
            onInputChange={(_, newValue) => setName(newValue)}
            renderInput={(params) => (
              <TextField {...params} label="Product name" required size="small" autoFocus />
            )}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              size="small"
              type="number"
              sx={{ flex: 1 }}
            />
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Unit</InputLabel>
              <Select value={unit} onChange={(e) => setUnit(e.target.value)} label="Unit">
                <MenuItem value="">-</MenuItem>
                {units.map((u) => (
                  <MenuItem key={u} value={u}>{u}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <FormControl size="small">
            <InputLabel>Category</InputLabel>
            <Select value={category} onChange={(e) => setCategory(e.target.value)} label="Category">
              <MenuItem value="">-</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Estimated price"
              value={estimatedPrice}
              onChange={(e) => setEstimatedPrice(e.target.value)}
              size="small"
              type="number"
              sx={{ flex: 1 }}
              InputProps={{
                endAdornment: <InputAdornment position="end">PLN</InputAdornment>,
              }}
            />
            {editItem && (
              <TextField
                label="Actual price"
                value={actualPrice}
                onChange={(e) => setActualPrice(e.target.value)}
                size="small"
                type="number"
                sx={{ flex: 1 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">PLN</InputAdornment>,
                }}
              />
            )}
          </Box>
          <TextField
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            size="small"
            placeholder="e.g. specific brand, size"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name.trim()}>
          {editItem ? 'Save' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ===== Shopping Item Row =====
interface ShoppingItemRowProps {
  item: ShoppingItemModel;
  onToggle: (itemId: string) => void;
  onEdit: (item: ShoppingItemModel) => void;
  onDelete: (itemId: string) => void;
  readOnly?: boolean;
}

const ShoppingItemRow: React.FC<ShoppingItemRowProps> = ({ item, onToggle, onEdit, onDelete, readOnly }) => {
  const priceFormatted = (item.actualPrice || item.estimatedPrice) !== undefined
    ? new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })
        .format(item.actualPrice || item.estimatedPrice || 0)
    : null;

  const quantityText = item.quantity
    ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
    : null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        py: 0.5,
        px: 1,
        '&:hover': { bgcolor: 'action.hover' },
        opacity: item.checked ? 0.6 : 1,
      }}
    >
      <Checkbox
        checked={item.checked}
        onChange={() => onToggle(item.id)}
        size="small"
        disabled={readOnly}
      />
      <Typography
        variant="body2"
        sx={{
          flex: 1,
          textDecoration: item.checked ? 'line-through' : 'none',
          fontWeight: item.checked ? 400 : 500,
        }}
      >
        {item.name}
      </Typography>
      {quantityText && (
        <Typography variant="body2" color="text.secondary" sx={{ mx: 1, minWidth: 60, textAlign: 'right' }}>
          {quantityText}
        </Typography>
      )}
      {priceFormatted && (
        <Typography variant="body2" color="text.secondary" sx={{ mx: 1, minWidth: 80, textAlign: 'right' }}>
          {priceFormatted}
        </Typography>
      )}
      {item.assignedPersonId && (
        <Box sx={{ mx: 0.5 }}>
          <PersonLabel id={item.assignedPersonId} size="small" />
        </Box>
      )}
      {item.note && (
        <Tooltip title={item.note}>
          <Chip label="note" size="small" variant="outlined" sx={{ mx: 0.5 }} />
        </Tooltip>
      )}
      {!readOnly && (
        <>
          <IconButton size="small" onClick={() => onEdit(item)}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => onDelete(item.id)} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </>
      )}
    </Box>
  );
};

// ===== Main Shopping Page =====
const ShoppingPage: React.FC = () => {
  const { dataSource, isDataLoaded, writeFile, loadAllData } = useFilesystem();

  const initialData = useMemo(() => {
    if (!isDataLoaded) return { lists: [] as ShoppingListModel[], categories: [] as string[], units: [] as string[], favoriteItems: [] as string[] };
    return {
      lists: dataSource.shoppingLists.map((l) => l.toModel()),
      categories: [] as string[],
      units: [] as string[],
      favoriteItems: [] as string[],
    };
  }, [dataSource, isDataLoaded]);

  const [lists, setLists] = useState<ShoppingListModel[]>(initialData.lists);
  const [customCategories] = useState<string[]>(initialData.categories);
  const [customUnits] = useState<string[]>(initialData.units);
  const [favoriteItems] = useState<string[]>(initialData.favoriteItems);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newListOpen, setNewListOpen] = useState(false);
  const [addItemListId, setAddItemListId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<{ listId: string; item: ShoppingItemModel } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'list' | 'item'; listId: string; itemId?: string } | null>(null);
  const [receiptScanOpen, setReceiptScanOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  // Sync when data loads
  React.useEffect(() => {
    if (isDataLoaded) {
      setLists(dataSource.shoppingLists.map((l) => l.toModel()));
      setIsDirty(false);
    }
  }, [isDataLoaded, dataSource]);

  // Preload AI + receipt scan configs (button always enabled, errors shown on scan)
  useEffect(() => {
    if (!isDataLoaded) return;
    aiService.loadConfig().catch(() => {});
    receiptScannerService.loadConfig().catch(() => {});
  }, [isDataLoaded]);

  // Merge categories
  const allCategories = useMemo(() => {
    const merged = new Set([...DEFAULT_SHOPPING_CATEGORIES, ...customCategories]);
    return Array.from(merged).sort();
  }, [customCategories]);

  // Merge units
  const allUnits = useMemo(() => {
    const merged = new Set([...DEFAULT_SHOPPING_UNITS, ...customUnits]);
    return Array.from(merged);
  }, [customUnits]);

  // All item names for autocomplete
  const allItemNames = useMemo(() => {
    const names = new Set<string>();
    for (const list of lists) {
      for (const item of list.items) {
        names.add(item.name);
      }
    }
    return Array.from(names);
  }, [lists]);

  // Filter lists by tab
  const filteredLists = useMemo(() => {
    switch (selectedTab) {
      case 0: return lists.filter(l => l.status === 'active');
      case 1: return lists.filter(l => l.status === 'completed');
      case 2: return lists;
      default: return lists;
    }
  }, [lists, selectedTab]);

  // Tab counts
  const activeCnt = useMemo(() => lists.filter(l => l.status === 'active').length, [lists]);
  const completedCnt = useMemo(() => lists.filter(l => l.status === 'completed').length, [lists]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Update list helper
  const updateList = useCallback((listId: string, updater: (list: ShoppingListModel) => ShoppingListModel) => {
    setLists((prev) => prev.map((l) => l.id === listId ? updater({ ...l }) : l));
    setIsDirty(true);
  }, []);

  // New list
  const handleNewList = useCallback((newList: ShoppingListModel) => {
    setLists((prev) => [newList, ...prev]);
    setExpandedIds((prev) => new Set(prev).add(newList.id));
    setIsDirty(true);
  }, []);

  // Toggle item checked
  const handleToggleItem = useCallback((listId: string, itemId: string) => {
    updateList(listId, (list) => ({
      ...list,
      items: list.items.map((i) =>
        i.id === itemId ? { ...i, checked: !i.checked } : i
      ),
    }));
  }, [updateList]);

  // Add item
  const handleAddItem = useCallback((listId: string, item: ShoppingItemModel) => {
    updateList(listId, (list) => ({
      ...list,
      items: [...list.items, item],
    }));
  }, [updateList]);

  // Update item (edit)
  const handleUpdateItem = useCallback((listId: string, item: ShoppingItemModel) => {
    updateList(listId, (list) => ({
      ...list,
      items: list.items.map((i) => i.id === item.id ? item : i),
    }));
  }, [updateList]);

  // Delete item
  const handleDeleteItem = useCallback((listId: string, itemId: string) => {
    updateList(listId, (list) => ({
      ...list,
      items: list.items.filter((i) => i.id !== itemId),
    }));
  }, [updateList]);

  // Complete list
  const handleCompleteList = useCallback((listId: string) => {
    updateList(listId, (list) => ({
      ...list,
      status: 'completed',
      completedAt: new Date().toISOString(),
    }));
  }, [updateList]);

  // Archive list
  const handleArchiveList = useCallback((listId: string) => {
    updateList(listId, (list) => ({
      ...list,
      status: 'archived',
    }));
  }, [updateList]);

  // Delete list
  const handleDeleteList = useCallback((listId: string) => {
    setLists((prev) => prev.filter((l) => l.id !== listId));
    setIsDirty(true);
  }, []);

  // Confirm delete
  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === 'list') {
      handleDeleteList(deleteConfirm.listId);
    } else if (deleteConfirm.itemId) {
      handleDeleteItem(deleteConfirm.listId, deleteConfirm.itemId);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, handleDeleteList, handleDeleteItem]);

  // Receipt scan → new list
  const handleReceiptNewList = useCallback((list: ShoppingListModel) => {
    setLists(prev => [list, ...prev]);
    setExpandedIds(prev => new Set(prev).add(list.id));
    setIsDirty(true);
    setReceiptScanOpen(false);
    setSnackbar({ open: true, message: `Lista z paragonu utworzona (${list.items.length} produktów)`, severity: 'success' });
  }, []);

  // Receipt scan → add to existing
  const handleReceiptAddToList = useCallback((listId: string, items: ShoppingItemModel[]) => {
    setLists(prev => prev.map(l =>
      l.id === listId ? { ...l, items: [...l.items, ...items] } : l
    ));
    setIsDirty(true);
    setReceiptScanOpen(false);
    setSnackbar({ open: true, message: `Dodano ${items.length} produktów z paragonu`, severity: 'success' });
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const data: ShoppingListsModel = {
        type: 'shopping_lists',
        lists,
        categories: customCategories.length > 0 ? customCategories : undefined,
        units: customUnits.length > 0 ? customUnits : undefined,
        favoriteItems: favoriteItems.length > 0 ? favoriteItems : undefined,
      };
      await writeFile(SHOPPING_PATH, JSON.stringify(data, null, 2));
      await loadAllData();
      setIsDirty(false);
      setSnackbar({ open: true, message: 'Saved successfully', severity: 'success' });
    } catch (err) {
      console.error('Failed to save shopping lists:', err);
      setSnackbar({ open: true, message: 'Failed to save', severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [lists, customCategories, customUnits, favoriteItems, writeFile, loadAllData]);

  // Progress helpers
  const getProgress = (list: ShoppingListModel) => {
    if (list.items.length === 0) return 0;
    return Math.round((list.items.filter(i => i.checked).length / list.items.length) * 100);
  };

  const getProgressText = (list: ShoppingListModel) => {
    return `${list.items.filter(i => i.checked).length}/${list.items.length}`;
  };

  const getEstimatedTotal = (list: ShoppingListModel) => {
    return list.items.reduce((sum, i) => sum + (i.estimatedPrice || 0), 0);
  };

  const getActualTotal = (list: ShoppingListModel) => {
    return list.items
      .filter(i => i.checked)
      .reduce((sum, i) => sum + (i.actualPrice || i.estimatedPrice || 0), 0);
  };

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value);
  };

  // Group items by category
  const groupByCategory = (items: ShoppingItemModel[]): Map<string, ShoppingItemModel[]> => {
    const groups = new Map<string, ShoppingItemModel[]>();
    for (const item of items) {
      const cat = item.category || 'inne';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    return groups;
  };

  if (!isDataLoaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, maxWidth: 900 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
        <ShoppingCartIcon color="primary" />
        <Typography variant="h5" sx={{ flex: 1 }}>
          Shopping Lists
        </Typography>
        <Button
          variant="outlined"
          startIcon={<ReceiptIcon />}
          onClick={() => setReceiptScanOpen(true)}
          sx={{ mr: 1 }}
        >
          Skanuj paragon
        </Button>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setNewListOpen(true)}
          sx={{ mr: 1 }}
        >
          New List
        </Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={!isDirty || saving}
        >
          Save
        </Button>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={selectedTab} onChange={(_, v) => setSelectedTab(v)} variant="fullWidth">
          <Tab label={`Active (${activeCnt})`} />
          <Tab label={`Completed (${completedCnt})`} />
          <Tab label={`All (${lists.length})`} />
        </Tabs>
      </Paper>

      {/* Lists */}
      {filteredLists.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <ShoppingCartIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
          <Typography color="text.secondary">
            {selectedTab === 0 ? 'No active shopping lists. Create one!' : 'No shopping lists found.'}
          </Typography>
        </Paper>
      ) : (
        filteredLists.map((list) => {
          const progress = getProgress(list);
          const isExpanded = expandedIds.has(list.id);
          const estimated = getEstimatedTotal(list);
          const actual = getActualTotal(list);
          const grouped = groupByCategory(list.items);
          const isReadOnly = list.status !== 'active';

          return (
            <Accordion
              key={list.id}
              expanded={isExpanded}
              onChange={() => toggleExpanded(list.id)}
              sx={{ mb: 1 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1, pr: 1 }}>
                  <ShoppingCartIcon color={list.status === 'active' ? 'primary' : 'disabled'} fontSize="small" />
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        {list.name}
                      </Typography>
                      {list.store && (
                        <Chip
                          icon={<StoreIcon />}
                          label={list.store}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {list.status === 'completed' && (
                        <Chip label="Completed" size="small" color="success" />
                      )}
                      {list.status === 'archived' && (
                        <Chip label="Archived" size="small" color="default" />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        {getProgressText(list)} items
                      </Typography>
                      {estimated > 0 && (
                        <Typography variant="body2" color="text.secondary">
                          Est: {formatPrice(estimated)}
                        </Typography>
                      )}
                      {actual > 0 && (
                        <Typography variant="body2" color="text.secondary">
                          Spent: {formatPrice(actual)}
                        </Typography>
                      )}
                      {list.budget !== undefined && list.budget > 0 && (
                        <Typography
                          variant="body2"
                          color={actual > list.budget ? 'error' : 'text.secondary'}
                        >
                          Budget: {formatPrice(list.budget)}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  <Box sx={{ width: 80, mr: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={progress}
                      color={progress === 100 ? 'success' : 'primary'}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                    <Typography variant="caption" color="text.secondary" textAlign="center" display="block">
                      {progress}%
                    </Typography>
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {/* Quick Add (active lists only) */}
                {!isReadOnly && (
                  <Box sx={{ mb: 1 }}>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setAddItemListId(list.id)}
                    >
                      Add item
                    </Button>
                  </Box>
                )}

                {/* Items grouped by category */}
                {list.items.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No items yet. Add your first product!
                  </Typography>
                ) : (
                  Array.from(grouped.entries()).map(([cat, items]) => (
                    <Box key={cat} sx={{ mb: 1 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ px: 1, py: 0.5, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
                      >
                        {cat}
                      </Typography>
                      <Divider />
                      {items.map((item) => (
                        <ShoppingItemRow
                          key={item.id}
                          item={item}
                          onToggle={(itemId) => handleToggleItem(list.id, itemId)}
                          onEdit={(itm) => setEditItem({ listId: list.id, item: itm })}
                          onDelete={(itemId) => setDeleteConfirm({ type: 'item', listId: list.id, itemId })}
                          readOnly={isReadOnly}
                        />
                      ))}
                    </Box>
                  ))
                )}

                {/* List actions */}
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {list.status === 'active' && (
                    <Button
                      size="small"
                      startIcon={<DoneAllIcon />}
                      color="success"
                      onClick={() => handleCompleteList(list.id)}
                    >
                      Complete Shopping
                    </Button>
                  )}
                  {list.status !== 'archived' && (
                    <Button
                      size="small"
                      startIcon={<ArchiveIcon />}
                      onClick={() => handleArchiveList(list.id)}
                    >
                      Archive
                    </Button>
                  )}
                  <Button
                    size="small"
                    startIcon={<DeleteIcon />}
                    color="error"
                    onClick={() => setDeleteConfirm({ type: 'list', listId: list.id })}
                  >
                    Delete
                  </Button>
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })
      )}

      {/* New List Dialog */}
      <NewListDialog
        open={newListOpen}
        onClose={() => setNewListOpen(false)}
        onSave={handleNewList}
      />

      {/* Add Item Dialog */}
      <AddItemDialog
        open={!!addItemListId}
        onClose={() => setAddItemListId(null)}
        onSave={(item) => {
          if (addItemListId) handleAddItem(addItemListId, item);
        }}
        favoriteItems={favoriteItems}
        allItemNames={allItemNames}
        categories={allCategories}
        units={allUnits}
      />

      {/* Edit Item Dialog */}
      <AddItemDialog
        open={!!editItem}
        onClose={() => setEditItem(null)}
        onSave={(item) => {
          if (editItem) handleUpdateItem(editItem.listId, item);
        }}
        favoriteItems={favoriteItems}
        allItemNames={allItemNames}
        categories={allCategories}
        units={allUnits}
        editItem={editItem?.item}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            {deleteConfirm?.type === 'list'
              ? 'Are you sure you want to delete this shopping list and all its items?'
              : 'Are you sure you want to remove this item?'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Receipt Scan Dialog */}
      <ReceiptScanDialog
        open={receiptScanOpen}
        onClose={() => setReceiptScanOpen(false)}
        existingLists={lists.filter(l => l.status === 'active')}
        onCreateNewList={handleReceiptNewList}
        onAddToExistingList={handleReceiptAddToList}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ShoppingPage;
