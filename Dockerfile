# Production & Testing Container for Da Gnome Pal on Mars
FROM node:22-alpine AS base
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS tester
WORKDIR /app
COPY . .
RUN npm test

FROM nginx:alpine AS runner
COPY --from=tester /app/index.html /usr/share/nginx/html/
COPY --from=tester /app/styles.css /usr/share/nginx/html/
COPY --from=tester /app/game.js /usr/share/nginx/html/
COPY --from=tester /app/LICENSE.md /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
