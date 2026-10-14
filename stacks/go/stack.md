# Go service

Kind: backend

## Summary

Go services, workers and CLIs that lean on the standard library first, with a small set of default libraries for new code. A repository that has already standardised on an alternative keeps it.

## Architecture

- One `main` package per binary under `cmd/<name>/`. Mains only parse flags, load config, wire dependencies and call into library packages.
- Everything not meant as a public API lives under `internal/`. Library packages sit at the root or are grouped by domain; no catch-all `pkg/`.
- No `util`, `common`, `helpers` or `base` packages. Start in one package and split only when the boundary is clear.
- Interfaces are small and declared by the consuming package, which is also how import cycles are broken.
- Constructors reject nil required dependencies or install a fail-closed default.
- HTTP middleware is a chain of `func(http.Handler) http.Handler`, ordered panic recovery, then request ID, then logging. Every request carries a correlation ID, generated at the edge if absent and propagated downstream.
- Servers always set read-header, read, write and idle timeouts and shut down gracefully on signal. Clients are built once with a timeout and reused; `http.DefaultClient` is not used.
- Every external read is bounded with `io.LimitReader` or `http.MaxBytesReader`, upstream responses included.
- Config precedence is defaults, then file, then environment, then flags. Config is parsed into a struct and validated at startup; the process refuses to start on an invalid value and names the field. Secrets come from the environment or a secret store, never the config file. Config keys and flags are a contract and are not renamed lightly.
- CLIs return errors up to `main`, which alone calls `os.Exit`; results go to stdout and diagnostics to stderr.
- A deferred branch panics with `not implemented` rather than returning `nil, nil`.

## Libraries

- github.com/go-chi/chi for routing, with stdlib-compatible handlers.
- github.com/jackc/pgx with `pgxpool` for Postgres.
- log/slog for logging: JSON in production, text in development.
- github.com/spf13/cobra for CLIs with subcommands; the stdlib `flag` package for a single command.
- github.com/spf13/viper for config merged from files, env and flags; stdlib `flag` plus env reads when that is enough.
- github.com/stretchr/testify for assertions.
- github.com/redis/go-redis for Redis.
- github.com/google/uuid for UUIDs.
- github.com/golang-jwt/jwt for tokens and github.com/go-playground/validator for input validation.
- golang.org/x/sync/errgroup for fan-out, golang.org/x/time/rate for rate limiting, github.com/sony/gobreaker for circuit breaking.
- github.com/testcontainers/testcontainers-go for database tests.
- Not gin, echo, lib/pq, logrus or zap unless the repository already chose them; `depguard` in `.golangci.yml` enforces this where the repository wants it mechanical.

## Data

- Parameterized queries only; SQL is never built with string formatting.
- Every query runs under a context with a timeout.
- Migrations are forward-only and versioned, and run as a deliberate step (a subcommand or deploy job), never on process start.
- Timestamps used in range queries are stored in a native ordered type (a timestamp type or integer epoch), never formatted text.
- Append-only tables are enforced in the schema with a trigger or constraint.
- Embedded SQLite opens with WAL, a busy timeout and a single open connection on every open path, including constructors that accept a caller's `*sql.DB`. Two writers on one file is a tested case.

## Messaging

None.

## Errors

- Errors are wrapped with `fmt.Errorf("context: %w", err)`, adding only context the caller lacks and never "failed to".
- Sentinel errors for conditions callers check with `errors.Is`; typed errors when callers need data out with `errors.As`. Error strings are never compared.
- An error is handled once: wrapped and returned, or logged, not both.
- A deliberately discarded error carries a comment saying why.
- Errors crossing a trust boundary are sanitized: the caller gets a stable generic message and the detail goes to the log. Paths, SQL and upstream bodies never appear in returned error text.
- Panic only for a genuinely impossible state, never in library code for an expected failure.
- Every switch over an external or pluggable value has a `default` that denies or errors. Such values are named types with declared constants so the `exhaustive` linter can check them.

## Naming

- Initialisms keep their case (`ID`, `URL`, `HTTP`). Every exported identifier has a doc comment starting with its name.
- Package names are one lower-case word named for what the package provides, and callers avoid stutter (`store.Get`, not `store.StoreGet`).
- Receivers are short and consistent across a type's methods.
- Log keys are consistent across the codebase and log lines are key/value pairs, never interpolated sentences. Secrets are redacted at the type level with `LogValue()` or `String()`.
- Table-test cases are keyed by behavior in a map.

## Testing

- Table-driven tests with a map of named cases and a subtest per case. Failure messages show the inputs and got versus want.
- Deterministic: injected clocks and fakes, no real network, no `time.Sleep`.
- Fixtures include boundary and hostile values. For each test, the author can name the one-line mutation that would make it fail; a test without one is rewritten.
- Parsers and anything taking untrusted bytes get a fuzz test asserting no panic.
- Large expected output lives in `testdata/` as golden files, regenerated behind an `-update` flag.
- HTTP is tested with `httptest`, including a fake upstream that returns errors, malformed bodies and timeouts.
- Database code runs against a real Postgres in testcontainers, not a mock.
- Integration tests sit behind the `integration` build tag and run with `go test -tags integration ./...`.
- `go test -race ./...` is the real suite; concurrent code is unverified until it passes under `-race`.

Formatting is checked by the lint leg: enable the gofmt and goimports formatters in `.golangci.yml`, because a bare `gofmt -l .` needs a shell to fail. A module with build tags adds a tagged gate line per leg, such as `go test -race -tags integration ./...`.

## Gate

- vet: go vet ./...
- lint: golangci-lint run
- build: go build ./...
- test: go test -race ./...
- vulns: govulncheck ./...

## Open choices

- router: chi, stdlib, gin, echo, gorilla (default chi)
- database: pgx, sqlx, gorm, database-sql, sqlite (default pgx)
- config: viper, koanf, envconfig, stdlib-flag (default viper)
- logging: slog, zap, zerolog, logrus (default slog)
- cli: cobra, urfave, stdlib-flag (default cobra)
- assertions: testify, stdlib (default testify)
- migrations: golang-migrate, goose (default golang-migrate)

## Concerns

- architecture (always-on): any change to Go code, package layout or `go.mod`
- http (on-demand): HTTP servers, handlers, middleware, clients and request forwarding
- persistence (on-demand): queries, transactions, schemas and migrations
- config (on-demand): config structs, flags, environment reads and startup validation
- concurrency (on-demand): goroutines, channels, locks, fan-out, retries and rate limiting
- security (on-demand): auth, tokens, crypto, secrets and handling of untrusted input
- cli (on-demand): commands, flags, exit codes and output of a CLI binary
- testing (on-demand): writing or changing unit, fuzz or integration tests
