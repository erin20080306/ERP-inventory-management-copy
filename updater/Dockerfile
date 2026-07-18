FROM docker:27-cli

RUN apk add --no-cache docker-cli-compose

COPY health /www/health
COPY update.cgi /www/cgi-bin/update
RUN chmod 0555 /www/cgi-bin/update

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["httpd", "-f", "-p", "8080", "-h", "/www"]
