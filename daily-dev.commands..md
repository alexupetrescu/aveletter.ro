# T1 — database (once per session)
docker compose -f docker-compose.dev.yml up -d

# T2 — Django
cd backend; .\venv\Scripts\Activate.ps1; python manage.py runserver 8020

# T3 — Next
cd frontend; npm run dev

python manage.py makemigrations
python manage.py migrate
python manage.py collectstatic



# Logs
sudo journalctl -u aveletter-gunicorn -f
sudo journalctl -u aveletter-next -f
tail -f /var/www/new.aveletter.ro/logs/gunicorn-error.log
tail -f /var/www/new.aveletter.ro/logs/deploy.log

# Restart
sudo systemctl restart aveletter-gunicorn
sudo systemctl restart aveletter-next
sudo systemctl reload nginx

# Deploy
cd /var/www/new.aveletter.ro && ./deploy.sh

# DB shell
psql "postgres://aveletter_user@127.0.0.1:5432/aveletter"

# Manual backup
/var/www/new.aveletter.ro/scripts/backup.sh

# Cert status
sudo certbot certificates
sudo certbot renew --dry-run