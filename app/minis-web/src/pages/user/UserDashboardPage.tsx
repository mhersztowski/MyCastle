import { Box, Typography, Card, CardContent, CardActionArea, Grid } from '@mui/material';
import { Devices, Build, FolderOpen } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';

function UserDashboardPage() {
  const navigate = useNavigate();
  const { userName } = useParams<{ userName: string }>();

  const activities = [
    {
      title: 'Add Assembled Device',
      description: 'Register an already assembled device',
      icon: <Devices sx={{ fontSize: 40 }} color="primary" />,
      onClick: () => navigate(`/user/${userName}/devices`),
    },
    {
      title: 'Assemble Device',
      description: 'Follow instructions to assemble a new device',
      icon: <Build sx={{ fontSize: 40 }} color="primary" />,
      onClick: () => navigate(`/user/${userName}/devices`),
    },
    {
      title: 'Open Device Project',
      description: 'Work on a project for your device',
      icon: <FolderOpen sx={{ fontSize: 40 }} color="primary" />,
      onClick: () => navigate(`/user/${userName}/projects`),
    },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Welcome!
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        What would you like to do?
      </Typography>
      <Grid container spacing={3} sx={{ mt: 2 }}>
        {activities.map((activity) => (
          <Grid item xs={12} sm={6} md={4} key={activity.title}>
            <Card sx={{ height: '100%' }}>
              <CardActionArea onClick={activity.onClick} sx={{ height: '100%', p: 2 }}>
                <CardContent sx={{ textAlign: 'center' }}>
                  {activity.icon}
                  <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                    {activity.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {activity.description}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

export default UserDashboardPage;
