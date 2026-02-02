# DevKit desktop app (Wails)
# Invoked from repo root via: make start (dev) or make app-build (build).
# Build requires Go 1.22 for Wails bindings (Go 1.24 triggers "package os without types").
# Use GOTOOLCHAIN=go1.22.4 so the correct toolchain is used when available.

.PHONY: build dev frontend frontend-build clean

build:
	GOTOOLCHAIN=go1.22.4 wails build

dev:
	GOTOOLCHAIN=go1.22.4 wails dev

frontend:
	cd frontend && npm install && npm run build

frontend-build:
	cd frontend && npm run build

clean:
	rm -rf frontend/dist build/bin
