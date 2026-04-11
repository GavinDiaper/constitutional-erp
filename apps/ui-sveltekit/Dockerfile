FROM node:20-alpine

WORKDIR /workspace/apps/ui-sveltekit

COPY apps/ui-sveltekit/package*.json ./
ENV npm_config_fetch_retries=5 \
	npm_config_fetch_retry_factor=2 \
	npm_config_fetch_retry_mintimeout=20000 \
	npm_config_fetch_retry_maxtimeout=120000 \
	npm_config_foreground_scripts=true
RUN npm ci --foreground-scripts || npm ci --foreground-scripts

COPY apps/ui-sveltekit ./
RUN npm run build

EXPOSE 4173
CMD ["node", "build"]
