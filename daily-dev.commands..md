# T1 — database (once per session)
docker compose -f docker-compose.dev.yml up -d

# T2 — Django
cd backend; .\venv\Scripts\Activate.ps1; python manage.py runserver 8020

# T3 — Next
cd frontend; npm run dev

python manage.py makemigrations
python manage.py migrate
python manage.py collectstatic