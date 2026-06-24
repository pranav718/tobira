from node:20-alpine as builder
workdir /app
copy package*.json ./
run npm ci
copy . .
run npm run build

from node:20-alpine as runner
workdir /app
copy --from=builder /app/package*.json ./
copy --from=builder /app/.next ./.next
copy --from=builder /app/public ./public
copy --from=builder /app/node_modules ./node_modules
expose 3000
cmd ["npm", "run", "start"]
