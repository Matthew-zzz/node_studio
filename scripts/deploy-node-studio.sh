#!/usr/bin/env bash
set -Eeuo pipefail
trap 'deploy_status=$?; printf "Публикация остановлена: строка %s, код %s. Ошибка команды указана выше.\n" "$LINENO" "$deploy_status" >&2' ERR

site_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
web_root=/var/www/node-studio.ru
config=/etc/nginx/sites-available/node-studio.ru
enabled=/etc/nginx/sites-enabled/node-studio.ru
wait_for_dns=0

case "${1:-}" in
    '') ;;
    --wait-dns) wait_for_dns=1 ;;
    --help)
        printf 'Запуск: sudo bash %s [--wait-dns]\n' "${BASH_SOURCE[0]}"
        printf '%s\n' '--wait-dns: проверять DNS каждые 5 минут до 24 часов, затем продолжить публикацию.'
        exit 0
        ;;
    *)
        printf 'Неизвестный параметр: %s\n' "$1" >&2
        exit 2
        ;;
esac
if [[ "$#" -gt 1 ]]; then
    echo 'Ожидался только один параметр: --wait-dns.' >&2
    exit 2
fi

if [[ "$EUID" -ne 0 ]]; then
    echo 'Запустите скрипт от root или через sudo.' >&2
    exit 1
fi

printf 'Публикация портфолио на https://node-studio.ru\n'

# sudo secure_path не включает Node.js, установленный через NVM.
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
    for node_bin in /root/.nvm/versions/node/*/bin; do
        if [[ -x "$node_bin/node" && -x "$node_bin/npm" ]]; then
            export PATH="$node_bin:$PATH"
            break
        fi
    done
fi

for dependency in node npm nginx certbot systemctl curl flock; do
    if ! command -v "$dependency" >/dev/null; then
        printf 'Не найдена обязательная команда: %s. Установите её и повторите запуск.\n' "$dependency" >&2
        exit 1
    fi
done

mkdir -p "$site_dir/.cache"
exec 9>"$site_dir/.cache/deploy-node-studio.lock"
if ! flock -n 9; then
    echo 'Другой процесс уже ожидает DNS или публикует этот сайт.' >&2
    exit 1
fi

if [[ -e "$enabled" && ! -L "$enabled" ]]; then
    echo "Ожидалась символическая ссылка: $enabled" >&2
    exit 1
fi
if [[ -L "$enabled" && "$(readlink "$enabled")" != "$config" ]]; then
    echo "У домена уже другая конфигурация: $enabled" >&2
    exit 1
fi
if [[ -e "$web_root/current" && ! -L "$web_root/current" ]]; then
    echo "Ожидалась символическая ссылка: $web_root/current" >&2
    exit 1
fi

if [[ "$wait_for_dns" -eq 1 ]]; then
    dns_deadline=$((SECONDS + 86400))
    while ! node "$site_dir/scripts/check-domain-dns.mjs"; do
        if [[ "$SECONDS" -ge "$dns_deadline" ]]; then
            echo 'За 24 часа DNS не стал доступен. Проверьте делегирование домена с поддержкой Timeweb.' >&2
            exit 1
        fi
        printf '[%s] Ожидаем обновления DNS; следующая проверка через 5 минут.\n' "$(date --iso-8601=seconds)"
        sleep 300
    done
else
    node "$site_dir/scripts/check-domain-dns.mjs"
fi

cd "$site_dir"
npm run build
npm run check
nginx -t

install -d -m 0755 "$web_root/releases" "$web_root/acme/.well-known/acme-challenge"
release_dir="$(mktemp -d "$web_root/releases/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
cp -a dist/. "$release_dir/"
find "$release_dir" -type d -exec chmod 0755 {} +
find "$release_dir" -type f -exec chmod 0644 {} +
ln -s "$release_dir" "$web_root/current.next.$$"
mv -Tf "$web_root/current.next.$$" "$web_root/current"

apply_config() {
    local template="$1" backup had_config=0 had_enabled=0
    backup="$(mktemp "$web_root/nginx-backup.XXXXXX")"
    if [[ -f "$config" ]]; then
        cp -p "$config" "$backup"
        had_config=1
    fi
    if [[ -L "$enabled" ]]; then had_enabled=1; fi
    install -m 0644 "$template" "$config"
    if [[ "$had_enabled" -eq 0 ]]; then ln -s "$config" "$enabled"; fi
    if nginx -t && systemctl reload nginx; then
        rm -- "$backup"
        return 0
    fi
    echo 'Не удалось применить Nginx; восстанавливаем конфигурацию домена.' >&2
    if [[ "$had_config" -eq 1 ]]; then
        cp -p "$backup" "$config"
    else
        rm -- "$config"
    fi
    if [[ "$had_enabled" -eq 0 ]]; then rm -- "$enabled"; fi
    rm -- "$backup"
    nginx -t && systemctl reload nginx
    return 1
}

# При повторном запуске сохраняем HTTPS на время обновления сертификата.
if [[ ! -f /etc/letsencrypt/live/node-studio.ru/fullchain.pem ]]; then
    apply_config "$site_dir/deploy/node-studio.ru.http.conf"
fi

certbot certonly --webroot --webroot-path "$web_root/acme" \
    --cert-name node-studio.ru --domain node-studio.ru \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --deploy-hook 'nginx -t && systemctl reload nginx'

apply_config "$site_dir/deploy/node-studio.ru.https.conf"
systemctl enable --now certbot.timer

for path in / /projects/autoparts/ /projects/anime-love/ /projects/vectra/ /robots.txt /sitemap.xml; do
    curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
        "https://node-studio.ru$path" --output /dev/null
done
curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
    https://node-studio.ru/ | cmp dist/index.html -
echo 'Портфолио опубликовано: https://node-studio.ru'
