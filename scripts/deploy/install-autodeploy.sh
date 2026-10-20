#!/usr/bin/env bash
# One-time installation on the existing Debian/Ubuntu Nginx host.
set -Eeuo pipefail
trap 'printf "Установка остановлена на строке %s. Исправьте ошибку выше и повторите запуск.\n" "$LINENO" >&2' ERR

site_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
web_root=/var/www/node-studio.ru
config=/etc/nginx/sites-available/node-studio.ru
enabled=/etc/nginx/sites-enabled/node-studio.ru
http_only=0
case "${1:-}" in
    '') ;;
    --http-only) http_only=1 ;;
    --help)
        echo 'Запуск от root: bash scripts/deploy/install-autodeploy.sh [--http-only]'
        echo 'По умолчанию проверяет DNS, включает автообновления и HTTPS.'
        echo '--http-only: только Nginx и автообновления, без DNS-проверки и сертификата.'
        exit 0 ;;
    *) echo "Неизвестный параметр: $1" >&2; exit 2 ;;
esac
[[ "$#" -le 1 ]] || { echo 'Ожидался не более одного параметра.' >&2; exit 2; }
[[ "$EUID" -eq 0 ]] || { echo 'Нужен запуск от root или через sudo.' >&2; exit 1; }
for dependency in python3 git curl nginx systemctl useradd install flock; do
    command -v "$dependency" >/dev/null || { echo "Не найдена команда: $dependency" >&2; exit 1; }
done
python3 -c 'import sys; assert sys.version_info >= (3, 12), "Нужен Python 3.12+"'
if [[ "$http_only" -eq 0 ]]; then
    command -v certbot >/dev/null || { echo 'Установите certbot.' >&2; exit 1; }
    python3 - <<'PY'
import socket
expected = '144.31.215.204'
addresses = {item[4][0] for item in socket.getaddrinfo('node-studio.ru', 80, type=socket.SOCK_STREAM)}
print('DNS node-studio.ru:', ', '.join(sorted(addresses)))
if addresses != {expected}:
    raise SystemExit(f'Нужна A-запись @ → {expected}. Удалите посторонние A/AAAA или настройте их на этот сервер.')
PY
fi
if [[ -e "$enabled" && ! -L "$enabled" ]] ||
   [[ -L "$enabled" && "$(readlink "$enabled")" != "$config" ]]; then
    echo "У домена другая конфигурация: $enabled" >&2; exit 1
fi
if [[ -e "$web_root/current" && ! -L "$web_root/current" ]]; then
    echo 'current должен быть символической ссылкой.' >&2; exit 1
fi
nginx -t
exec 9>/run/lock/node-studio-install.lock
flock -n 9 || { echo 'Установщик уже запущен.' >&2; exit 1; }

if ! id node-studio-deploy >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /var/lib/node-studio-deploy --shell /usr/sbin/nologin node-studio-deploy
fi
systemctl stop node-studio-deploy.timer node-studio-deploy.service 2>/dev/null || true
install -d -m 0755 -o node-studio-deploy -g node-studio-deploy \
    /var/lib/node-studio-deploy "$web_root" "$web_root/releases" "$web_root/shared"
install -d -m 0755 "$web_root/acme/.well-known/acme-challenge" /usr/local/lib/node-studio
install -m 0644 "$site_dir/scripts/deploy/deployment.py" /usr/local/lib/node-studio/deployment.py
# Preserve resources of a pre-existing Next.js release before changing Nginx.
if [[ -d "$web_root/current/_next/static" ]]; then
    cp -an "$web_root/current/_next" "$web_root/shared/"
    chown -R node-studio-deploy:node-studio-deploy "$web_root/shared"
fi
install -m 0644 "$site_dir/deploy/node-studio-deploy.service" /etc/systemd/system/node-studio-deploy.service
install -m 0644 "$site_dir/deploy/node-studio-deploy.timer" /etc/systemd/system/node-studio-deploy.timer

apply_config() {
    local template="$1" backup had_config=0 had_enabled=0
    backup="$(mktemp /tmp/node-studio-nginx.XXXXXX)"
    if [[ -f "$config" ]]; then cp -p "$config" "$backup"; had_config=1; fi
    if [[ -L "$enabled" ]]; then had_enabled=1; fi
    install -m 0644 "$template" "$config"
    if [[ "$had_enabled" -eq 0 ]]; then ln -s "$config" "$enabled"; fi
    if nginx -t && systemctl reload nginx; then rm -- "$backup"; return 0; fi
    echo 'Восстанавливаем предыдущую конфигурацию Nginx.' >&2
    if [[ "$had_config" -eq 1 ]]; then cp -p "$backup" "$config"; else rm -- "$config"; fi
    if [[ "$had_enabled" -eq 0 ]]; then rm -- "$enabled"; fi
    rm -- "$backup"
    nginx -t && systemctl reload nginx
    return 1
}

if [[ -f /etc/letsencrypt/live/node-studio.ru/fullchain.pem ]]; then
    apply_config "$site_dir/deploy/node-studio.ru.https.conf"
else
    apply_config "$site_dir/deploy/node-studio.ru.http.conf"
fi
systemctl daemon-reload
if ! systemctl start node-studio-deploy.service; then
    journalctl -u node-studio-deploy.service -n 25 --no-pager >&2
    echo 'Проверьте успешный workflow и наличие ветки production в GitHub, затем повторите установку.' >&2
    exit 1
fi
systemctl enable --now node-studio-deploy.timer

if [[ "$http_only" -eq 0 ]]; then
    certbot certonly --webroot --webroot-path "$web_root/acme" \
        --cert-name node-studio.ru --domain node-studio.ru \
        --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
    install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
    cat > /etc/letsencrypt/renewal-hooks/deploy/node-studio-nginx <<'HOOK'
#!/usr/bin/env sh
set -eu
nginx -t
systemctl reload nginx
HOOK
    chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/node-studio-nginx
    apply_config "$site_dir/deploy/node-studio.ru.https.conf"
    systemctl enable --now certbot.timer
    curl --fail --silent --show-error --max-time 30 https://node-studio.ru/deployment.json \
        | cmp "$web_root/current/deployment.json" -
fi
echo 'Автообновления включены: main → проверки GitHub Actions → production → сервер (до 30 секунд после сборки).'
systemctl list-timers node-studio-deploy.timer --no-pager
