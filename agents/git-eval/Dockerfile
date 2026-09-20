FROM node:20-alpine
WORKDIR /app
COPY package.json AgentCard.json ./
COPY server.js ./
COPY lib ./lib
ENV PORT=8000
ENV NODE_ENV=production
EXPOSE 8000
CMD ["node", "server.js"]
