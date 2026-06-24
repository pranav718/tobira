from golang:1.22-alpine as builder
workdir /app
copy go.mod go.sum ./
run go mod download
copy . .
run go build -o tobira-server cmd/server/main.go

from alpine:latest
workdir /app
copy --from=builder /app/tobira-server .
expose 8080
entrypoint ["/app/tobira-server"]
