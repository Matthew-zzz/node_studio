#!/usr/bin/env bash
set -Eeuo pipefail
trap 'deploy_status=$?; printf "Переключение scorevo.ru остановлено: строка %s, код %s.\n" "$LINENO" "$deploy_status" >&2' ERR

site_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
web_root=/var/www/scorevo-portfolio
config=/etc/nginx/sites-available/scorevo.ru
original_config=/var/backups/portfolio-scorevo/scorevo.ru.before-portfolio.conf
mode="${1:-deploy}"

case "$mode" in
    deploy|--restore) ;;
    --help)
        printf 'Запуск: sudo bash %s [--restore]\n' "${BASH_SOURCE[0]}"
        printf '%s\n' '--restore возвращает конфигурацию scorevo.ru, сохранённую до портфолио.'
        exit 0
        ;;
    *) printf 'Неизвестный параметр: %s\n' "$mode" >&2; exit 2 ;;
esac
if [[ "$#" -gt 1 ]]; then echo 'Передано слишком много параметров.' >&2; exit 2; fi
if [[ "$EUID" -ne 0 ]]; then echo 'Запустите от root или через sudo.' >&2; exit 1; fi

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
    for node_bin in /root/.nvm/versions/node/*/bin; do
        if [[ -x "$node_bin/node" && -x "$node_bin/npm" ]]; then
            export PATH="$node_bin:$PATH"
            break
        fi
    done
fi
for dependency in node npm nginx systemctl curl flock openssl; do
    if ! command -v "$dependency" >/dev/null; then
        printf 'Не найдена обязательная команда: %s\n' "$dependency" >&2
        exit 1
    fi
done
mkdir -p "$site_dir/.cache"
exec 9>"$site_dir/.cache/deploy-scorevo.lock"
if ! flock -n 9; then echo 'Другой процесс уже переключает scorevo.ru.' >&2; exit 1; fi

if [[ ! -f "$config" || "$(readlink -f /etc/nginx/sites-enabled/scorevo.ru)" != "$config" ]]; then
    echo 'Не найдена ожидаемая активная конфигурация scorevo.ru.' >&2
    exit 1
fi

activate_config() {
    local candidate="$1" previous
    previous="$(mktemp "$site_dir/.cache/scorevo-nginx.XXXXXX")"
    cp -p "$config" "$previous"
    install -m 0644 "$candidate" "$config"
    if nginx -t && systemctl reload nginx && verify_site; then
        rm -- "$previous"
        return 0
    fi
    echo 'Проверка не прошла; возвращаем прежнюю конфигурацию scorevo.ru.' >&2
    install -m 0644 "$previous" "$config"
    nginx -t && systemctl reload nginx
    rm -- "$previous"
    return 1
}

verify_site() {
    if [[ "$mode" == --restore ]]; then
        curl --fail --silent --show-error --connect-timeout 5 --max-time 15 \
            --resolve scorevo.ru:443:127.0.0.1 https://scorevo.ru/ --output /dev/null || return 1
        return 0
    fi
    local path missing_status
    for path in / /projects/autoparts/ /projects/anime-love/ /projects/vectra/ /styles.css /assets/favicon.svg /robots.txt /sitemap.xml; do
        curl --fail --silent --show-error --connect-timeout 5 --max-time 15 \
            --resolve scorevo.ru:443:127.0.0.1 "https://scorevo.ru$path" --output /dev/null || return 1
    done
    curl --fail --silent --show-error --connect-timeout 5 --max-time 15 \
        --resolve scorevo.ru:443:127.0.0.1 https://scorevo.ru/ | cmp "$build_dir/index.html" - || return 1
    missing_status="$(curl --silent --show-error --connect-timeout 5 --max-time 15 \
        --resolve scorevo.ru:443:127.0.0.1 https://scorevo.ru/__portfolio_not_found_check__ \
        --output /dev/null --write-out '%{http_code}')" || return 1
    if [[ "$missing_status" != 404 ]]; then
        printf 'Неверный статус отсутствующей страницы: %s\n' "$missing_status" >&2
        return 1
    fi
    curl --fail --silent --show-error --connect-timeout 5 --max-time 20 \
        https://scorevo.ru/ | cmp "$build_dir/index.html" - || return 1
}

if [[ "$mode" == --restore ]]; then
    if [[ ! -f "$original_config" ]]; then echo 'Сохранённая конфигурация не найдена.' >&2; exit 1; fi
    nginx -t
    activate_config "$original_config"
    echo 'На scorevo.ru возвращена конфигурация, сохранённая до размещения портфолио.'
    exit 0
fi

echo 'Подготовка временного портфолио для https://scorevo.ru'
if [[ ! -f /etc/letsencrypt/live/scorevo.ru/fullchain.pem ]]; then
    echo 'Не найден существующий HTTPS-сертификат scorevo.ru.' >&2
    exit 1
fi
openssl x509 -in /etc/letsencrypt/live/scorevo.ru/fullchain.pem -noout -checkend 0
build_dir="$site_dir/.cache/scorevo-dist"
cd "$site_dir"
SITE_ORIGIN=https://scorevo.ru SITE_OUTPUT_DIR="$build_dir" npm run build
SITE_OUTPUT_DIR="$build_dir" npm run check
nginx -t

install -d -m 0700 /var/backups/portfolio-scorevo
if [[ ! -f "$original_config" ]]; then
    if [[ "$(< "$config")" != *'root /var/www/herdr-miniapp;'* ]]; then
        echo 'Исходная конфигурация изменилась; сохранённой копии Herdr нет. Переключение остановлено.' >&2
        exit 1
    fi
    cp -p "$config" "$original_config"
fi
if [[ -e "$web_root/current" && ! -L "$web_root/current" ]]; then
    echo 'Путь current занят обычным файлом или каталогом.' >&2
    exit 1
fi
install -d -m 0755 "$web_root/releases"
release_dir="$(mktemp -d "$web_root/releases/$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
cp -a "$build_dir/." "$release_dir/"
find "$release_dir" -type d -exec chmod 0755 {} +
find "$release_dir" -type f -exec chmod 0644 {} +
ln -s "$release_dir" "$web_root/current.next.$$"
mv -Tf "$web_root/current.next.$$" "$web_root/current"

activate_config "$site_dir/deploy/scorevo.ru.portfolio.conf"
echo 'Портфолио опубликовано: https://scorevo.ru'
printf 'Возврат прежнего сайта: sudo bash %s --restore\n' "${BASH_SOURCE[0]}"
