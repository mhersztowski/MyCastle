import { Box, Typography, Card, CardContent, CardActionArea, Grid } from '@mui/material';
import { Code, Assignment as ProjectsIcon, DeveloperBoard } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

function UserDashboardPage() {
  const navigate = useNavigate();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        User Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Edit and work with project files
      </Typography>
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardActionArea onClick={() => navigate('/user/projects')}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <ProjectsIcon sx={{ mr: 1 }} color="primary" />
                  <Typography variant="h6">Projects</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  View and manage your project realizations
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardActionArea onClick={() => navigate('/user/editor/monaco/')}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Code sx={{ mr: 1 }} color="primary" />
                  <Typography variant="h6">Monaco Editor</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Open the code editor for project files
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardActionArea onClick={() => navigate('/user/project')}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <DeveloperBoard sx={{ mr: 1 }} color="primary" />
                  <Typography variant="h6">Project Editor</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Visual block-based Arduino programming with code editor
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default UserDashboardPage;
