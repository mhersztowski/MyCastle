import { useState } from 'react';
import {
  Box, Typography, TextField, Button, Alert, Card, CardContent,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@modules/auth';

function LoginPage() {
  const { userName } = useParams<{ userName: string }>();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!userName || !password) return;
    setLoading(true);
    setError(null);
    try {
      const user = await login(userName, password);
      if (user.isAdmin) {
        navigate(`/admin/${userName}/main`);
      } else {
        navigate(`/user/${userName}/main`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        p: 3,
      }}
    >
      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" gutterBottom align="center">
            Login
          </Typography>
          <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 3 }}>
            User: {userName}
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TextField
            fullWidth
            type="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            sx={{ mb: 3 }}
            autoFocus
          />

          <Button
            fullWidth
            variant="contained"
            onClick={handleLogin}
            disabled={loading || !password}
            size="large"
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>

          <Button
            fullWidth
            variant="text"
            onClick={() => navigate('/')}
            sx={{ mt: 1 }}
          >
            Back
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

export default LoginPage;
