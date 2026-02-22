import { Box, Typography, Card, CardContent, CardActionArea, Grid } from '@mui/material';
import { Folder, Save, Assignment as ProjectsIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

function AdminDashboardPage() {
  const navigate = useNavigate();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Admin Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Manage files and system settings
      </Typography>
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardActionArea onClick={() => navigate('/admin/projects')}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <ProjectsIcon sx={{ mr: 1 }} color="primary" />
                  <Typography variant="h6">Project Definitions</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Define and manage project templates
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardActionArea onClick={() => navigate('/admin/filesystem/list')}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Folder sx={{ mr: 1 }} color="primary" />
                  <Typography variant="h6">File Browser</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Browse and manage project files
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardActionArea onClick={() => navigate('/admin/filesystem/save')}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Save sx={{ mr: 1 }} color="primary" />
                  <Typography variant="h6">Save File</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Create and save new files
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default AdminDashboardPage;
