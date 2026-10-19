FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt update \
  && apt install -y nginx sqlite3 curl git ca-certificates gnupg build-essential python3 tzdata \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt install -y nodejs \
  && npm install -g pm2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/duanxian
COPY . .

RUN chmod +x deploy/scripts/*.sh \
  && sed -i 's/server_name your-domain.com;/server_name _;/' deploy/nginx/duanxian.conf \
  && cp deploy/nginx/duanxian.conf /etc/nginx/sites-enabled/default

COPY deploy/rehearsal/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
