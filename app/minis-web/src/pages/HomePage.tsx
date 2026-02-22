import { Box, Typography, Card, CardContent, CardActionArea, Grid } from '@mui/material';
import { AdminPanelSettings, Person } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

function HomePage() {
  const navigate = useNavigate();

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
        Minis
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        DIY Electronics Project Manager
      </Typography>
      <Grid container spacing={4} sx={{ mt: 2, maxWidth: 600 }}>
        <Grid item xs={12} sm={6}>
          <Card>
            <CardActionArea onClick={() => navigate('/admin')}>
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <AdminPanelSettings sx={{ fontSize: 48, mb: 1 }} color="primary" />
                <Typography variant="h5">Admin</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Manage files and system settings
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Card>
            <CardActionArea onClick={() => navigate('/user')}>
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Person sx={{ fontSize: 48, mb: 1 }} color="primary" />
                <Typography variant="h5">User</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Edit and work with project files
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default HomePage;
