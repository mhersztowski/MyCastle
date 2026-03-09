import { AppBar, Box, IconButton, Toolbar } from '@mui/material';
import { Castle as CastleIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@modules/auth';
import { AccountMenu } from './AccountMenu';
import { MinimalTopBarProvider, useMinimalTopBarContext } from './MinimalTopBarContext';

function MinimalTopBarInner({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const { slot } = useMinimalTopBarContext();
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', position: 'fixed', inset: 0 }}>
      <AppBar
        position="static"
        sx={{ minHeight: 36, flexShrink: 0, paddingTop: 'env(safe-area-inset-top)', '& .MuiToolbar-root': { minHeight: 36, py: 0 } }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 36, px: 1.5, gap: 1 }}>
          <IconButton
            size="small"
            onClick={() => navigate(`/user/${currentUser?.name ?? ''}/main`)}
            sx={{ color: 'inherit', p: { xs: 0.75, sm: 0.25 }, flexShrink: 0 }}
          >
            <CastleIcon sx={{ fontSize: { xs: 20, sm: 16 }, opacity: 0.85 }} />
          </IconButton>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
            {slot}
          </Box>
          {currentUser && (
            <AccountMenu isAdminView={false} userName={currentUser.name} />
          )}
        </Toolbar>
      </AppBar>
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </Box>
    </Box>
  );
}

export function MinimalTopBar({ children }: { children: React.ReactNode }) {
  return (
    <MinimalTopBarProvider>
      <MinimalTopBarInner>{children}</MinimalTopBarInner>
    </MinimalTopBarProvider>
  );
}
