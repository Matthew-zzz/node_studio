#!/usr/bin/env bash
# One-time installation. Subsequent API updates follow verified site revisions.
set -Eeuo pipefail
trap 'printf "Установка кабинета остановлена на строке %s.\n" "$LINENO" >&2' ERR
[[ "$EUID" -eq 0 ]] || { echo 'Запустите установщик от root.' >&2; exit 1; }
site_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
for dependency in node python3 git nginx systemctl useradd runuser install flock curl; do
    command -v "$dependency" >/dev/null || { echo "Не найдена команда: $dependency" >&2; exit 1; }
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) process.exit(1)'
python3 -c 'import sys; assert sys.version_info >= (3, 12), "Нужен Python 3.12+"'
[[ -f /var/www/node-studio.ru/current/deployment.json ]] || { echo 'Сначала включите автообновления сайта.' >&2; exit 1; }
nginx -t
exec 9>/run/lock/node-studio-portal-install.lock
flock -n 9 || { echo 'Установщик уже запущен.' >&2; exit 1; }
if ! id node-studio-portal >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /var/lib/node-studio-portal --shell /usr/sbin/nologin node-studio-portal
fi
install -d -m 0700 -o node-studio-portal -g node-studio-portal /var/lib/node-studio-portal /var/lib/node-studio-portal/data
install -d -m 0700 /etc/node-studio-portal
install -d -m 0755 /usr/local/lib/node-studio-portal /etc/nginx/snippets
systemctl stop node-studio-portal.service 2>/dev/null || true
install -m 0755 "$(command -v node)" /usr/local/lib/node-studio-portal/node
install -m 0644 "$site_dir/scripts/deploy/portal_runtime.py" /usr/local/lib/node-studio-portal/portal_runtime.py
install -m 0644 "$site_dir/deploy/node-studio-portal.service" /etc/systemd/system/node-studio-portal.service
if [[ ! -f /etc/node-studio-portal/portal.env ]]; then
    python3 - <<'PY'
from pathlib import Path
from secrets import token_hex
path = Path('/etc/node-studio-portal/portal.env')
path.write_text('PORTAL_ORIGIN=https://node-studio.ru\nPORTAL_PORT=3158\n'
                'PORTAL_DATABASE=/var/lib/node-studio-portal/data/portal.sqlite\n'
                'PORTAL_MOCK_PAYMENTS=true\nPORTAL_MOCK_PROVISIONING=false\n'
                f'PORTAL_ENCRYPTION_KEY={token_hex(32)}\n'
                f'PORTAL_GITHUB_WEBHOOK_SECRET={token_hex(32)}\n'
                f'PORTAL_TELEGRAM_WEBHOOK_SECRET={token_hex(32)}\n')
path.chmod(0o600)
PY
fi
systemctl daemon-reload
systemctl enable --now node-studio-portal.service
api_ready=0
for attempt in {1..180}; do
    if curl --fail --silent --max-time 2 http://127.0.0.1:3158/api/portal/health >/dev/null; then api_ready=1; break; fi
    sleep 1
done
[[ "$api_ready" -eq 1 ]] || { echo 'API не запустился. Проверьте journalctl -u node-studio-portal.' >&2; exit 1; }

config=/etc/nginx/sites-available/node-studio.ru
backup="$(mktemp /tmp/node-studio-portal-nginx.XXXXXX)"
cp -p "$config" "$backup"
install -m 0644 "$site_dir/deploy/node-studio-portal.nginx.conf" /etc/nginx/snippets/node-studio-portal.conf
python3 - "$config" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
if 'include /etc/nginx/snippets/node-studio-portal' not in text:
    anchor = '    location ^~ /_next/static/ {'
    if text.count(anchor) != 1:
        raise SystemExit('Не найдена однозначная конфигурация статики NODO Studio.')
    text = text.replace(anchor, '    include /etc/nginx/snippets/node-studio-portal*.conf;\n\n' + anchor)
    path.write_text(text)
PY
if ! nginx -t || ! systemctl reload nginx; then
    cp -p "$backup" "$config"
    nginx -t && systemctl reload nginx
    rm -- "$backup"
    exit 1
fi
rm -- "$backup"

# Generated passwords are written only to a root-readable file, never stdout or argv.
if [[ ! -f /etc/node-studio-portal/bootstrap.complete ]]; then
    python3 - <<'PY'
import json
from pathlib import Path
from secrets import token_urlsafe
import re
import subprocess
state = Path('/var/lib/node-studio-portal')
sha = json.loads((state / 'active.json').read_text())['source_sha']
release = state / 'releases' / sha
path = Path('/etc/node-studio-portal/bootstrap.txt')
names = {'developer': 'Разработчик', 'curator': 'Поддержка', 'admin': 'Администратор'}
if not path.exists():
    path.write_text('\n'.join(f'{role}: {role}@node-studio.local\nВременный пароль: {token_urlsafe(24)}\n' for role in names))
    path.chmod(0o600)
users = [{'role': role, 'email': email, 'name': names[role], 'password': password}
         for role, email, password in re.findall(r'(developer|curator|admin): (\S+)\nВременный пароль: (\S+)', path.read_text())]
if len(users) != 3:
    raise SystemExit('Неполный файл первоначальных доступов.')
subprocess.run(['runuser', '-u', 'node-studio-portal', '--', 'env',
                'PORTAL_DATABASE=/var/lib/node-studio-portal/data/portal.sqlite',
                '/usr/local/lib/node-studio-portal/node', 'server/cli.ts', 'bootstrap'],
               input=json.dumps(users), text=True, check=True, cwd=release, capture_output=True)
Path('/etc/node-studio-portal/bootstrap.complete').touch(mode=0o600)
PY
fi
curl --fail --silent --show-error --max-time 15 https://node-studio.ru/api/portal/health
echo
echo 'Кабинет: https://node-studio.ru/cabinet/'
echo 'Временные доступы сотрудников: /etc/node-studio-portal/bootstrap.txt (только root).'
echo 'При первом входе обязательно смените пароль. Подключения: /etc/node-studio-portal/portal.env.'
echo 'API будет автоматически обновляться после проверок GitHub Actions.'
