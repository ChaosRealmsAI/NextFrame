.PHONY: help check check-rust check-ts clippy fmt fmt-check build clean install-frontend

help:
	@echo "NextFrame · v0.1.1 scaffold targets"
	@echo ""
	@echo "  make check              cargo check + clippy + tsc --noEmit"
	@echo "  make check-rust         cargo check --workspace"
	@echo "  make check-ts           tsc --noEmit in frontend/nf-components"
	@echo "  make clippy             cargo clippy --workspace --all-targets -- -D warnings"
	@echo "  make fmt                cargo fmt --all"
	@echo "  make fmt-check          cargo fmt --all -- --check"
	@echo "  make build              cargo build --release"
	@echo "  make clean              cargo clean + rm -rf frontend/nf-components/node_modules"
	@echo "  make install-frontend   npm install in frontend/nf-components"

check: check-rust clippy check-ts

check-rust:
	cargo check --workspace --all-targets

check-ts:
	cd frontend/nf-components && npx --no-install tsc --noEmit

clippy:
	cargo clippy --workspace --all-targets -- -D warnings

fmt:
	cargo fmt --all

fmt-check:
	cargo fmt --all -- --check

build:
	cargo build --release --workspace

clean:
	cargo clean
	rm -rf frontend/nf-components/node_modules frontend/nf-components/dist

install-frontend:
	cd frontend/nf-components && npm install
