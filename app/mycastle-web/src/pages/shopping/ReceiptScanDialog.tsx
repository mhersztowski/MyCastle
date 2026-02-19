/**
 * ReceiptScanDialog - multi-step wizard for scanning receipts.
 * Steps: Capture -> Processing -> Review -> Import
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, CircularProgress, Alert,
  TextField, IconButton, Paper,
  Select, MenuItem, FormControl, InputLabel,
  Stepper, Step, StepLabel,
  useTheme, useMediaQuery, Divider,
  Radio, RadioGroup, FormControlLabel,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CloseIcon from '@mui/icons-material/Close';
import CameraCapture from '../../components/upload/CameraCapture';
import { receiptScannerService } from '../../modules/shopping/services/ReceiptScannerService';
import { ReceiptData, ReceiptItem } from '../../modules/shopping/models/ReceiptModels';
import { ENGINE_LABELS } from '../../modules/shopping/models/ReceiptScanConfigModel';
import { ShoppingListModel, ShoppingItemModel } from '@mhersztowski/core';
import { DEFAULT_SHOPPING_CATEGORIES, DEFAULT_SHOPPING_UNITS } from '../../modules/filesystem/models/ShoppingModel';
import { v4 as uuidv4 } from 'uuid';

type WizardStep = 'capture' | 'processing' | 'review' | 'import';

const STEP_LABELS = ['Zdjęcie', 'Analiza', 'Przegląd', 'Import'];

function stepIndex(step: WizardStep): number {
  const map: Record<WizardStep, number> = { capture: 0, processing: 1, review: 2, import: 3 };
  return map[step];
}

interface ReceiptScanDialogProps {
  open: boolean;
  onClose: () => void;
  existingLists: ShoppingListModel[];
  onCreateNewList: (list: ShoppingListModel) => void;
  onAddToExistingList: (listId: string, items: ShoppingItemModel[]) => void;
}

// ===== CAPTURE STEP =====

interface CapturedImage {
  blob: Blob;
  url: string;
}

const CaptureStep: React.FC<{
  images: CapturedImage[];
  onAddImage: (blob: Blob) => void;
  onRemoveImage: (index: number) => void;
  onProceed: () => void;
  isMobile: boolean;
}> = ({ images, onAddImage, onRemoveImage, onProceed, isMobile }) => {
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (showCamera) {
    return (
      <Box sx={{ height: isMobile ? '60vh' : 400 }}>
        <CameraCapture
          onCapture={(blob) => {
            setShowCamera(false);
            onAddImage(blob);
          }}
          onCancel={() => setShowCamera(false)}
        />
      </Box>
    );
  }

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 3, py: 4,
    }}>
      {images.length === 0 ? (
        <>
          <ReceiptIcon sx={{ fontSize: 64, color: 'grey.400' }} />
          <Typography variant="body1" color="text.secondary" textAlign="center">
            Zrób zdjęcie paragonu lub wybierz plik
          </Typography>
        </>
      ) : (
        <>
          {/* Thumbnail gallery */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {images.map((img, index) => (
              <Paper
                key={index}
                variant="outlined"
                sx={{ position: 'relative', width: 100, height: 130, overflow: 'hidden' }}
              >
                <Box
                  component="img"
                  src={img.url}
                  alt={`Zdjęcie ${index + 1}`}
                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <IconButton
                  size="small"
                  onClick={() => onRemoveImage(index)}
                  sx={{
                    position: 'absolute', top: 2, right: 2,
                    bgcolor: 'rgba(0,0,0,0.5)', color: 'white',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                    width: 24, height: 24,
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    bgcolor: 'rgba(0,0,0,0.5)', color: 'white',
                    textAlign: 'center', py: 0.25,
                  }}
                >
                  {index + 1}
                </Typography>
              </Paper>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {images.length === 1
              ? 'Jeśli paragon jest długi, dodaj kolejne zdjęcia'
              : `${images.length} zdjęcia — dodaj kolejne lub przejdź dalej`}
          </Typography>
        </>
      )}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button
          variant={images.length > 0 ? 'outlined' : 'contained'}
          startIcon={<CameraAltIcon />}
          onClick={() => setShowCamera(true)}
          size="large"
        >
          {images.length > 0 ? 'Dodaj zdjęcie' : 'Zrób zdjęcie'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<UploadFileIcon />}
          onClick={() => fileInputRef.current?.click()}
          size="large"
        >
          {images.length > 0 ? 'Dodaj plik' : 'Wybierz plik'}
        </Button>
        {images.length > 0 && (
          <Button
            variant="contained"
            onClick={onProceed}
            size="large"
          >
            Analizuj {images.length > 1 ? `(${images.length} zdjęć)` : ''}
          </Button>
        )}
      </Box>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onAddImage(file);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
    </Box>
  );
};

// ===== PROCESSING STEP =====

const ProcessingStep: React.FC<{
  imageUrls: string[];
  error: string | null;
  onRetry: () => void;
  engineLabel?: string;
}> = ({ imageUrls, error, onRetry, engineLabel }) => (
  <Box sx={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 2, py: 4, minHeight: 200,
  }}>
    {imageUrls.length > 0 && (
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
        {imageUrls.map((url, i) => (
          <Box
            key={i}
            component="img"
            src={url}
            alt={`Receipt ${i + 1}`}
            sx={{
              maxHeight: imageUrls.length > 1 ? 120 : 200,
              maxWidth: imageUrls.length > 1 ? 100 : '100%',
              objectFit: 'contain',
              borderRadius: 1, opacity: error ? 0.5 : 0.7,
            }}
          />
        ))}
      </Box>
    )}
    {error ? (
      <>
        <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert>
        <Button variant="outlined" onClick={onRetry}>Spróbuj ponownie</Button>
      </>
    ) : (
      <>
        <CircularProgress />
        <Typography variant="body1" color="text.secondary">
          Analizuję paragon{imageUrls.length > 1 ? ` (${imageUrls.length} zdjęć)` : ''}
          {engineLabel ? ` (${engineLabel})` : ''}...
        </Typography>
      </>
    )}
  </Box>
);

// ===== REVIEW STEP =====

const ReviewStep: React.FC<{
  receiptData: ReceiptData;
  onChange: (data: ReceiptData) => void;
  isMobile: boolean;
}> = ({ receiptData, onChange, isMobile }) => {

  const updateItem = (index: number, field: keyof ReceiptItem, value: unknown) => {
    const updated = [...receiptData.items];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ ...receiptData, items: updated });
  };

  const removeItem = (index: number) => {
    const updated = receiptData.items.filter((_, i) => i !== index);
    onChange({ ...receiptData, items: updated });
  };

  const addItem = () => {
    const newItem: ReceiptItem = { name: '', quantity: 1, unit: 'szt', price: 0, category: 'inne' };
    onChange({ ...receiptData, items: [...receiptData.items, newItem] });
  };

  const calculatedTotal = receiptData.items.reduce((sum, item) => sum + item.price, 0);
  const totalDiscount = receiptData.items.reduce((sum, item) => sum + (item.discount || 0), 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header fields */}
      <Box sx={{ display: 'flex', gap: 2, flexDirection: isMobile ? 'column' : 'row' }}>
        <TextField
          label="Sklep"
          value={receiptData.storeName || ''}
          onChange={(e) => onChange({ ...receiptData, storeName: e.target.value || undefined })}
          size="small"
          fullWidth
        />
        <TextField
          label="Data"
          value={receiptData.date || ''}
          onChange={(e) => onChange({ ...receiptData, date: e.target.value || undefined })}
          size="small"
          type="date"
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 160 }}
        />
      </Box>

      {/* Totals comparison */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary">
          Suma z paragonu: <strong>{receiptData.total?.toFixed(2) ?? '—'} PLN</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Suma pozycji: <strong>{calculatedTotal.toFixed(2)} PLN</strong>
        </Typography>
        {totalDiscount > 0 && (
          <Typography variant="body2" color="success.main">
            Rabaty: <strong>-{totalDiscount.toFixed(2)} PLN</strong>
          </Typography>
        )}
      </Box>

      <Divider />

      {/* Items */}
      {receiptData.items.map((item, index) => (
        <Paper
          key={index}
          variant="outlined"
          sx={{
            p: isMobile ? 1.5 : 1,
            borderLeft: item.discount ? '3px solid' : undefined,
            borderLeftColor: item.discount ? 'success.main' : undefined,
          }}
        >
          <Box sx={{
            display: 'flex', flexDirection: isMobile ? 'column' : 'row',
            gap: 1, alignItems: isMobile ? 'stretch' : 'center',
          }}>
            <TextField
              label="Nazwa"
              value={item.name}
              onChange={(e) => updateItem(index, 'name', e.target.value)}
              size="small"
              sx={{ flexGrow: 1, minWidth: isMobile ? undefined : 180 }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                label="Ilość"
                type="number"
                value={item.quantity ?? ''}
                onChange={(e) => updateItem(index, 'quantity', e.target.value ? Number(e.target.value) : undefined)}
                size="small"
                sx={{ width: 80 }}
                inputProps={{ step: 0.1, min: 0 }}
              />
              <FormControl size="small" sx={{ minWidth: 80 }}>
                <InputLabel>Jedn.</InputLabel>
                <Select
                  value={item.unit || ''}
                  onChange={(e) => updateItem(index, 'unit', e.target.value || undefined)}
                  label="Jedn."
                >
                  <MenuItem value="">—</MenuItem>
                  {DEFAULT_SHOPPING_UNITS.map(u => (
                    <MenuItem key={u} value={u}>{u}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Cena"
                type="number"
                value={item.price}
                onChange={(e) => updateItem(index, 'price', Number(e.target.value) || 0)}
                size="small"
                sx={{ width: 90 }}
                inputProps={{ step: 0.01, min: 0 }}
              />
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Kategoria</InputLabel>
                <Select
                  value={item.category || 'inne'}
                  onChange={(e) => updateItem(index, 'category', e.target.value)}
                  label="Kategoria"
                >
                  {DEFAULT_SHOPPING_CATEGORIES.map(c => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <IconButton size="small" onClick={() => removeItem(index)} color="error">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
          {/* Discount info */}
          {item.discount && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5, ml: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textDecoration: 'line-through' }}>
                {item.originalPrice?.toFixed(2)} PLN
              </Typography>
              <Typography variant="caption" color="success.main" fontWeight="bold">
                -{item.discount.toFixed(2)} PLN
              </Typography>
            </Box>
          )}
        </Paper>
      ))}

      <Button
        startIcon={<AddIcon />}
        onClick={addItem}
        size="small"
        sx={{ alignSelf: 'flex-start' }}
      >
        Dodaj produkt
      </Button>
    </Box>
  );
};

// ===== IMPORT STEP =====

const ImportStep: React.FC<{
  receiptData: ReceiptData;
  existingLists: ShoppingListModel[];
  importMode: 'new' | 'existing';
  selectedListId: string;
  newListName: string;
  onImportModeChange: (mode: 'new' | 'existing') => void;
  onSelectedListChange: (id: string) => void;
  onNewListNameChange: (name: string) => void;
}> = ({
  receiptData, existingLists, importMode, selectedListId, newListName,
  onImportModeChange, onSelectedListChange, onNewListNameChange,
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 1 }}>
    <Typography variant="body2" color="text.secondary">
      {receiptData.items.length} produktów do zaimportowania
      {receiptData.storeName && ` ze sklepu ${receiptData.storeName}`}
    </Typography>

    <RadioGroup
      value={importMode}
      onChange={(e) => onImportModeChange(e.target.value as 'new' | 'existing')}
    >
      <FormControlLabel
        value="new"
        control={<Radio />}
        label="Utwórz nową listę"
      />
      {importMode === 'new' && (
        <TextField
          label="Nazwa listy"
          value={newListName}
          onChange={(e) => onNewListNameChange(e.target.value)}
          size="small"
          fullWidth
          sx={{ ml: 4, mb: 1 }}
        />
      )}

      <FormControlLabel
        value="existing"
        control={<Radio />}
        label="Dodaj do istniejącej listy"
        disabled={existingLists.length === 0}
      />
      {importMode === 'existing' && existingLists.length > 0 && (
        <FormControl size="small" sx={{ ml: 4, mb: 1 }}>
          <InputLabel>Lista</InputLabel>
          <Select
            value={selectedListId}
            onChange={(e) => onSelectedListChange(e.target.value)}
            label="Lista"
            sx={{ minWidth: 200 }}
          >
            {existingLists.map(l => (
              <MenuItem key={l.id} value={l.id}>
                {l.name}{l.store ? ` (${l.store})` : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </RadioGroup>
  </Box>
);

// ===== MAIN DIALOG =====

const ReceiptScanDialog: React.FC<ReceiptScanDialogProps> = ({
  open, onClose, existingLists, onCreateNewList, onAddToExistingList,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [step, setStep] = useState<WizardStep>('capture');
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Import options
  const [importMode, setImportMode] = useState<'new' | 'existing'>('new');
  const [selectedListId, setSelectedListId] = useState('');
  const [newListName, setNewListName] = useState('');

  const reset = useCallback(() => {
    setStep('capture');
    capturedImages.forEach(img => URL.revokeObjectURL(img.url));
    setCapturedImages([]);
    setReceiptData(null);
    setError(null);
    setImportMode('new');
    setSelectedListId(existingLists[0]?.id || '');
    setNewListName('');
  }, [existingLists, capturedImages]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleAddImage = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    setCapturedImages(prev => [...prev, { blob, url }]);
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setCapturedImages(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].url);
      updated.splice(index, 1);
      return updated;
    });
  }, []);

  const startScan = useCallback(async (images: CapturedImage[]) => {
    if (images.length === 0) return;
    setStep('processing');
    setError(null);

    try {
      const blobs = images.map(img => img.blob);
      const data = await receiptScannerService.scanReceipt(blobs);
      setReceiptData(data);
      const parts = [data.storeName, data.date].filter(Boolean);
      setNewListName(parts.length > 0 ? parts.join(' — ') : 'Paragon');
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd');
    }
  }, []);

  const handleProceed = useCallback(() => {
    startScan(capturedImages);
  }, [capturedImages, startScan]);

  const handleRetry = useCallback(() => {
    capturedImages.forEach(img => URL.revokeObjectURL(img.url));
    setCapturedImages([]);
    setError(null);
    setStep('capture');
  }, [capturedImages]);

  const handleRescan = useCallback(async () => {
    if (capturedImages.length === 0) return;
    startScan(capturedImages);
  }, [capturedImages, startScan]);

  const receiptItemsToShoppingItems = useCallback((items: ReceiptItem[]): ShoppingItemModel[] => {
    return items.map(item => ({
      type: 'shopping_item' as const,
      id: uuidv4(),
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      actualPrice: item.price,
      checked: true,
    }));
  }, []);

  const handleImport = useCallback(() => {
    if (!receiptData) return;

    const shoppingItems = receiptItemsToShoppingItems(receiptData.items);

    if (importMode === 'new') {
      const newList: ShoppingListModel = {
        type: 'shopping_list',
        id: uuidv4(),
        name: newListName || 'Paragon',
        store: receiptData.storeName,
        status: 'completed',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        items: shoppingItems,
      };
      onCreateNewList(newList);
    } else {
      if (selectedListId) {
        onAddToExistingList(selectedListId, shoppingItems);
      }
    }
    reset();
  }, [receiptData, importMode, newListName, selectedListId, receiptItemsToShoppingItems, onCreateNewList, onAddToExistingList, reset]);

  const canImport = useMemo(() => {
    if (!receiptData || receiptData.items.length === 0) return false;
    if (importMode === 'new') return !!newListName.trim();
    return !!selectedListId;
  }, [receiptData, importMode, newListName, selectedListId]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ReceiptIcon />
        Skanuj paragon
        <Box sx={{ flexGrow: 1 }} />
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* Stepper */}
        <Stepper activeStep={stepIndex(step)} sx={{ mb: 3 }} alternativeLabel={!isMobile}>
          {STEP_LABELS.map((label) => (
            <Step key={label}>
              <StepLabel>{isMobile ? '' : label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {/* Step content */}
        {step === 'capture' && (
          <CaptureStep
            images={capturedImages}
            onAddImage={handleAddImage}
            onRemoveImage={handleRemoveImage}
            onProceed={handleProceed}
            isMobile={isMobile}
          />
        )}

        {step === 'processing' && (
          <ProcessingStep
            imageUrls={capturedImages.map(img => img.url)}
            error={error}
            onRetry={handleRetry}
            engineLabel={ENGINE_LABELS[receiptScannerService.getEngine()]}
          />
        )}

        {step === 'review' && receiptData && (
          <ReviewStep
            receiptData={receiptData}
            onChange={setReceiptData}
            isMobile={isMobile}
          />
        )}

        {step === 'import' && receiptData && (
          <ImportStep
            receiptData={receiptData}
            existingLists={existingLists}
            importMode={importMode}
            selectedListId={selectedListId}
            newListName={newListName}
            onImportModeChange={setImportMode}
            onSelectedListChange={setSelectedListId}
            onNewListNameChange={setNewListName}
          />
        )}
      </DialogContent>

      <DialogActions>
        {step === 'review' && (
          <>
            <Button onClick={handleRescan} disabled={capturedImages.length === 0}>
              Skanuj ponownie
            </Button>
            <Button onClick={handleRetry}>
              Nowe zdjęcia
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="contained"
              onClick={() => setStep('import')}
              disabled={!receiptData || receiptData.items.length === 0}
            >
              Dalej
            </Button>
          </>
        )}

        {step === 'import' && (
          <>
            <Button onClick={() => setStep('review')}>
              Wstecz
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={!canImport}
            >
              Importuj ({receiptData?.items.length ?? 0} produktów)
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ReceiptScanDialog;
