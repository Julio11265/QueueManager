# Ticket Queue Manager

A small Flask web app to manage the daily ticket queue table.

## Features

- Reorder agents by drag and drop.
- Mark an agent as Out of Office; row becomes yellow.
- Mark an agent as P1; row becomes red.
- Edit numeric columns: Easy, Investigation, Autoclose.
- Edit text columns: EMEA Handovers, Jobs/P1.
- Shows the current date.
- Persists data in PostgreSQL through `DATABASE_URL`.
- Uses SQLite locally when `DATABASE_URL` is not set.

## Local run

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
flask --app app run --debug
```

Open http://127.0.0.1:5000

## Deploy to Render with Neon

1. Create a Neon Postgres project and copy the connection string.
2. Push this folder to a GitHub repository.
3. In Render, create a Web Service from the repo.
4. Use:
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
5. Add environment variable:
   - `DATABASE_URL=<your Neon connection string>`
6. Deploy.

The app creates its database tables automatically on startup.
