# E2B custom template for Soul Chef dish-card rendering.
#
# Bakes Node, Chromium (via puppeteer's bundled download) and the card
# artwork into the sandbox image, so a workflow run only has to write
# order.json and run `node render.js` — no npm install, no asset fetch,
# on the hot path.
#
# Build and publish with the E2B CLI (run from this e2b/ folder):
#   npx @e2b/cli auth login
#   npx @e2b/cli template create soulchef-pdf --dockerfile e2b.Dockerfile --cpu-count 2 --memory-mb 2048
#
# That prints a template ID/name — put it in the n8n workflow's
# "Create Sandbox" node's `template` field.
FROM node:20-slim

# Chromium's runtime deps (puppeteer's postinstall downloads Chromium itself,
# but the shared libraries it needs are not in the slim base image).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
    libnspr4 libnss3 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 \
    libxrandr2 xdg-utils wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/user

COPY package.json .puppeteerrc.cjs ./

# Pin Chrome's location for the build step too: puppeteer's postinstall runs
# as root and otherwise downloads into /root/.cache, which `user` never reads.
ENV PUPPETEER_CACHE_DIR=/home/user/.cache/puppeteer
RUN npm install \
    && npx puppeteer browsers install chrome \
    && ls /home/user/.cache/puppeteer/chrome

COPY render.js build-assets.js ./
COPY assets ./assets

# Bake Tailwind's CSS and the Google Fonts into assets/ so a render needs no
# network. Tailwind 3.4 matches what cdn.tailwindcss.com served before.
RUN node build-assets.js \
    && npx tailwindcss -c tailwind.config.cjs -i tailwind.input.css -o assets/tailwind.css --minify

# Build steps run as root, but the sandbox writes order.json/output.pdf as `user`.
RUN chmod -R a+rwX /home/user
