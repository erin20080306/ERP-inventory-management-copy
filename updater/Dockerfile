FROM docker:27-cli

# docker:27-cli no longer guarantees that the BusyBox httpd applet is
# available.  The updater exposes a tiny authenticated CGI endpoint, so make
# its runtime dependencies explicit instead of relying on the base image.
RUN apk add --no-cache docker-cli-compose busybox-extras \
    && httpd_path="$(command -v httpd)" \
    && test -n "$httpd_path" \
    && test -x "$httpd_path" \
    && ln -sf "$httpd_path" /usr/local/bin/erin-httpd \
    && command -v wget >/dev/null \
    && docker compose version >/dev/null

COPY health /www/health
COPY update.cgi /www/cgi-bin/update
RUN chmod 0555 /www/cgi-bin/update

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/usr/local/bin/erin-httpd", "-f", "-p", "8080", "-h", "/www"]
