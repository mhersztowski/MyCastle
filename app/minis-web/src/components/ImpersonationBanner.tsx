import { Box, Typography, Button } from '@mui/material';
import { Close as StopIcon, PersonSearch as ImpersonateIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@modules/auth';

function ImpersonationBanner() {
  const { currentUser, impersonating, stopImpersonating } = useAuth();
  const navigate = useNavigate();

  if (!impersonating) return null;

  const handleStop = () => {
    stopImpersonating();
    navigate(`/admin/${currentUser!.name}/main`);
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1201,
        bgcolor: 'warning.main',
        color: 'warning.contrastText',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        py: 0.5,
        px: 2,
      }}
    >
      <ImpersonateIcon fontSize="small" />
      <Typography variant="body2" fontWeight="bold">
        Viewing as: {impersonating.name}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        startIcon={<StopIcon />}
        onClick={handleStop}
        sx={{ ml: 1, borderColor: 'inherit' }}
      >
        Stop
      </Button>
    </Box>
  );
}

export default ImpersonationBanner;
