import { AppBar, Box, Toolbar } from '@mui/material';
import { Castle as CastleIcon } from '@mui/icons-material';
import { useAuth } from '@modules/auth';
import { AccountMenu } from './AccountMenu';
import { MinimalTopBarProvider, useMinimalTopBarContext } from './MinimalTopBarContext';

function MinimalTopBarInner({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const { slot } = useMinimalTopBarContext();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <AppBar
        position="static"
        sx={{ minHeight: 36, flexShrink: 0, '& .MuiToolbar-root': { minHeight: 36, py: 0 } }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 36, px: 1.5, gap: 1 }}>
          <CastleIcon sx={{ fontSize: 16, opacity: 0.7, flexShrink: 0 }} />
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
