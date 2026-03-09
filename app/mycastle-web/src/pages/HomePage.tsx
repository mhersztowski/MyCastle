import { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, CardActionArea, Grid,
  CircularProgress, Alert, Chip,
} from '@mui/material';
import { Person, AdminPanelSettings } from '@mui/icons-material';
import { Navigate, useNavigate } from 'react-router-dom';
import { minisApi, type UserPublic } from '../services/MinisApiService';
import { useAuth } from '@modules/auth';

function HomePage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    minisApi.getPublicUsers()
      .then(setUsers)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (currentUser) {
    return <Navigate to={`/user/${currentUser.name}/main`} replace />;
  }

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
      <Typography variant="h3" gutterBottom>
        MyCastle
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        DIY Electronics Project Manager
      </Typography>

      {loading && <CircularProgress sx={{ mt: 4 }} />}
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {!loading && users.length === 0 && !error && (
        <Typography variant="body1" color="text.secondary" sx={{ mt: 4 }}>
          No users found. Create users via admin API.
        </Typography>
      )}

      <Grid container spacing={3} sx={{ mt: 2, maxWidth: 800 }}>
        {users.map((user) => (
          <Grid item xs={12} sm={6} md={4} key={user.id}>
            <Card>
              <CardActionArea onClick={() => navigate(`/login/${user.name}`)}>
                <CardContent sx={{ textAlign: 'center', py: 4 }}>
                  {user.isAdmin ? (
                    <AdminPanelSettings sx={{ fontSize: 48, mb: 1 }} color="primary" />
                  ) : (
                    <Person sx={{ fontSize: 48, mb: 1 }} color="primary" />
                  )}
                  <Typography variant="h5">{user.name}</Typography>
                  {user.isAdmin && (
                    <Chip label="Admin" color="primary" size="small" sx={{ mt: 1 }} />
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default HomePage;
