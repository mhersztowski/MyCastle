import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Tabs,
  Tab,
} from '@mui/material';
import ErrorIcon from '@mui/icons-material/Error';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SchemaIcon from '@mui/icons-material/Schema';
import { ValidationError } from '../utils/JsonSchemaUtils';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{ height: '100%', overflow: 'auto' }}
    >
      {value === index && children}
    </Box>
  );
};

interface ValidationErrorModalProps {
  open: boolean;
  onClose: () => void;
  onSaveAnyway?: () => void;
  onGoToError?: (line: number, column: number) => void;
  errors: ValidationError[];
  fileName?: string;
  schema?: object;
}

const ValidationErrorModal: React.FC<ValidationErrorModalProps> = ({
  open,
  onClose,
  onSaveAnyway,
  onGoToError,
  errors,
  fileName,
  schema,
}) => {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleGoToError = (error: ValidationError) => {
    if (error.position && onGoToError) {
      onGoToError(error.position.line, error.position.column);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { height: '85vh', maxHeight: '85vh' },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          bgcolor: 'error.light',
          color: 'error.contrastText',
          pb: 1,
        }}
      >
        <WarningAmberIcon />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Validation Errors
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ color: 'inherit' }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab
            icon={<ErrorIcon />}
            iconPosition="start"
            label={`Errors (${errors.length})`}
          />
          <Tab
            icon={<SchemaIcon />}
            iconPosition="start"
            label="Schema"
            disabled={!schema}
          />
        </Tabs>
      </Box>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ p: 2 }}>
            {fileName && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                File: <strong>{fileName}</strong>
              </Typography>
            )}

            <Typography variant="body1" sx={{ mb: 2 }}>
              Found {errors.length} validation error{errors.length !== 1 ? 's' : ''}:
            </Typography>

            <List dense>
              {errors.map((error, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <Divider component="li" />}
                  <ListItem
                    sx={{
                      bgcolor: 'error.lighter',
                      borderLeft: '4px solid',
                      borderColor: 'error.main',
                      my: 0.5,
                      borderRadius: 1,
                      cursor: error.position && onGoToError ? 'pointer' : 'default',
                      '&:hover': error.position && onGoToError ? {
                        bgcolor: 'error.light',
                      } : {},
                    }}
                    onClick={() => handleGoToError(error)}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <ErrorIcon color="error" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontFamily: 'monospace',
                                bgcolor: 'grey.100',
                                px: 1,
                                py: 0.5,
                                borderRadius: 0.5,
                                display: 'inline-block',
                              }}
                            >
                              {error.path || '/'}
                            </Typography>
                            {error.position && (
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.5,
                                  bgcolor: 'warning.light',
                                  color: 'warning.contrastText',
                                  px: 1,
                                  py: 0.25,
                                  borderRadius: 0.5,
                                  fontSize: '0.75rem',
                                  fontFamily: 'monospace',
                                }}
                              >
                                <LocationOnIcon sx={{ fontSize: 14 }} />
                                Line {error.position.line}, Col {error.position.column}
                              </Box>
                            )}
                          </Box>
                          <Typography variant="body1" color="error.dark">
                            {error.message}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mt: 0.5, display: 'block' }}
                        >
                          Rule: <code>{error.keyword}</code>
                          {error.params && Object.keys(error.params).length > 0 && (
                            <span> | Params: {JSON.stringify(error.params)}</span>
                          )}
                        </Typography>
                      }
                    />
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
              JSON Schema used for validation:
            </Typography>
            <Box
              component="pre"
              sx={{
                bgcolor: 'grey.100',
                p: 2,
                borderRadius: 1,
                overflow: 'auto',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                m: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {schema ? JSON.stringify(schema, null, 2) : 'No schema available'}
            </Box>
          </Box>
        </TabPanel>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {onSaveAnyway && (
          <Button
            onClick={onSaveAnyway}
            color="warning"
            variant="outlined"
          >
            Save Anyway
          </Button>
        )}
        <Button
          onClick={onClose}
          variant="contained"
          autoFocus
        >
          Fix Errors
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ValidationErrorModal;
