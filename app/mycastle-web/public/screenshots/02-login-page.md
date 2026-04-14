# 02-login-page

**URL:** `http://localhost:1894/login/marcin`

## Interface Description

## Login Page

Password entry form for a specific user (user name is embedded in the URL).

**Elements:**
- **Username display** — shows the selected user's name (read-only).
- **Password field** — plain text masked input. Submitting logs the user in.
- **Login button** — triggers POST /api/auth/login. On success, JWT token stored in sessionStorage and user redirected to their dashboard.
- **Back button** — returns to the Home Page (user selection).

**Auth flow:** JWT token valid 7 days. Admins land on `/admin/{user}/main`, regular users on `/user/{user}/main`.
