import { Box, Typography, Card, CardContent, CardActionArea, Grid } from '@mui/material';
import {
  People as PeopleIcon,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';

function AdminDashboardPage() {
  const navigate = useNavigate();
  const { userName } = useParams<{ userName: string }>();

  const cards = [
    { title: 'Users', desc: 'Manage users', icon: <PeopleIcon />, path: `/admin/${userName}/users` },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Admin Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Manage users, devices, modules, and projects
      </Typography>
      <Grid container spacing={3} sx={{ mt: 2 }}>
        {cards.map((card) => (
          <Grid item xs={12} sm={6} md={4} key={card.title}>
            <Card>
              <CardActionArea onClick={() => navigate(card.path)}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    {card.icon}
                    <Typography variant="h6" sx={{ ml: 1 }}>{card.title}</Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {card.desc}
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

export default AdminDashboardPage;
