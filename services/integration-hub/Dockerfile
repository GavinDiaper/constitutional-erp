FROM node:20-alpine

WORKDIR /workspace/services/integration-hub

COPY tsconfig.base.json /workspace/tsconfig.base.json
COPY services/integration-hub/package*.json ./
ENV npm_config_fetch_retries=5 \
	npm_config_fetch_retry_factor=2 \
	npm_config_fetch_retry_mintimeout=20000 \
	npm_config_fetch_retry_maxtimeout=120000 \
	npm_config_foreground_scripts=true
RUN npm ci --foreground-scripts || npm ci --foreground-scripts

COPY services/integration-hub ./
RUN npm run build

EXPOSE 4017
CMD ["node", "dist/src/server.js"]
