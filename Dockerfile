FROM ghcr.io/puppeteer/puppeteer:23.11.1
USER root
WORKDIR /app
COPY package.json ./
RUN PUPPETEER_SKIP_DOWNLOAD=1 npm install --omit=dev
COPY . .
RUN chown -R pptruser /app
USER pptruser
ENV CHROME=/usr/bin/google-chrome-stable PORT=10000
CMD ["node","server.js"]
