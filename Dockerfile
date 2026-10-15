FROM ghcr.io/puppeteer/puppeteer:23.11.1
USER root
RUN ln -sf "$(find /home/pptruser/.cache/puppeteer -type f -name chrome | head -1)" /usr/local/bin/chrome && /usr/local/bin/chrome --version
WORKDIR /app
COPY package.json ./
RUN PUPPETEER_SKIP_DOWNLOAD=1 npm install --omit=dev
COPY . .
RUN chown -R pptruser /app
USER pptruser
ENV CHROME=/usr/local/bin/chrome PORT=10000
CMD ["node","server.js"]
