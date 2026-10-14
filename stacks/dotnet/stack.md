# .NET service

Kind: backend

## Summary

.NET 10 microservices on Clean Architecture, with CQRS through MediatR and a result type in place of exceptions for business outcomes. Existing services keep their established patterns; the defaults below apply to new services and new code where the service has no pattern yet.

## Architecture

- Four source projects, `{Root}.{Service}.Domain`, `.Application`, `.Infrastructure` and `.Api`, under `src/`; tests under `tests/`. `{Root}` is the organization's namespace prefix, mirrored from the existing solution.
- Dependencies point inward: Api to Application to Domain; Infrastructure references Application and Domain. Application never references Infrastructure, and Domain references nothing.
- Application defines interfaces; Infrastructure implements them. A class goes in Infrastructure only when it needs EF Core, an HTTP or gRPC client, a cache, a broker or the file system. Pure logic stays in Application as a concrete class with no interface.
- The Api layer talks to Application only by sending queries and commands through `ISender`.
- Features live under `Application/Features/{Feature}/` with `Handlers/`, `Validators/` and `Responses/` subfolders.
- DI is registered per layer in a `{Layer}Module` class (a solution-defined `Module` base with `ConfigureServices(services, configuration)` and an `AddModule<T>` extension). `Program.cs` adds Application, Infrastructure, then Api modules and registers nothing inline. Modules carry `[ExcludeFromCodeCoverage]`.
- Scoped lifetime by default; singleton only for stateless, thread-safe services.
- Primary constructors for DI classes. `record` for queries, commands, requests, responses, DTOs and event contracts; `class` for entities, handlers, services, repositories, jobs and consumers.
- Central package management in `Directory.Packages.props`; no `Version` on a `PackageReference`. `Directory.Build.props` sets nullable, implicit usings and warnings as errors.
- Health endpoints: `/hc` runs every check with the UI response writer; `/health` is liveness only and runs none.
- Services behind the gateway trust forwarded identity headers; a standalone service validates its own JWT. Establish which before touching auth, CORS or `AllowAnonymous()`.

## Libraries

- FastEndpoints for HTTP endpoints, with its Swagger package.
- MediatR for queries, commands and pipeline behaviors.
- Ardalis.Result for handler outcomes.
- FluentValidation, run as a MediatR pipeline behavior.
- EF Core on SQL Server.
- FusionCache: in-memory L1, Redis L2 and a Redis backplane.
- MassTransit on Azure Service Bus (RabbitMQ locally).
- Hangfire with SQL Server storage for recurring jobs.
- Grpc.AspNetCore and Grpc.Net.ClientFactory; gRPC is the default for internal service-to-service calls.
- Microsoft.Extensions.Http.Resilience for external HTTP clients.
- RedLock.net for distributed locks on Redis.
- OpenTelemetry for traces and metrics; `ILogger<T>` with the JSON console formatter.
- SonarAnalyzer, Roslynator and Meziantou analyzers.

## Data

- Fluent API only, never data annotations; one `IEntityTypeConfiguration<T>` per entity in `Infrastructure/Data/Configurations/`.
- Tables are snake_case singular with no prefix (`order_line`); junction tables are `{a}_{b}`. Columns are snake_case; the key is `id`, foreign keys are `{table}_id`, booleans are `is_{adjective}`.
- Every table has required `created_at` and `updated_at`, set by the DbContext rather than by callers.
- Indexes are named `IX_{table}_{column}` and unique ones `UX_{table}_{column}`.
- Required relationships use `DeleteBehavior.Restrict`. Decimals get an explicit column type.
- Entities are plain classes with `{ get; set; }`: `int Id`, or `long Id` for high-volume and junction tables; parent navigations `= null!`; collections `ICollection<T> = []`.
- Repositories: interface in `Application/Repositories/`, implementation in `Infrastructure/Repositories/`, all async with a trailing `CancellationToken`. Jobs and handlers use repositories, never the DbContext directly.
- Migrations are generated with `dotnet ef` against the Infrastructure project with Api as the startup project, and applied by `MigrateAsync()` at startup. Generated Designer files are never edited.

## Messaging

- Events are immutable records named `{Name}Event` in a separate `{Root}.{Service}.Events` project published as a package.
- Publish events with `IPublishEndpoint` to topics; use `ISendEndpoint` only for point-to-point commands to a named queue.
- One consumer per event, `{EventName}Consumer`, in `Infrastructure/ServiceBus/Listeners/`. Consumers are thin and send a MediatR command; they are idempotent and use `SentTime` to discard stale events.
- Every bus configures exponential retry and a kill switch, with dead-letter transport per endpoint, and the in-memory outbox so events publish only after the database commit.
- Recurring jobs are `{Action}{Entity}Job` classes with `ExecuteAsync(CancellationToken)`, registered after `app.Build()` with `RecurringJob.AddOrUpdate` using `nameof` as the job id, a cron expression from configuration and `MisfireHandlingMode.Ignorable`.
- Jobs only orchestrate, carry `[AutomaticRetry]`, record duration and outcome metrics, and run on one Hangfire worker for data-processing services. The dashboard at `/hangfire` is always behind basic auth.
- Work that can overlap on the same aggregate (jobs, read-modify-write handlers, consumers) takes a RedLock lock keyed `{entity}Id_{id}` at the narrowest granularity that keeps the operation consistent.

## Errors

- Every handler returns `Result<T>` or `Result`: `NotFound()`, `Invalid(...)`, `Error(...)`. No exceptions and no try/catch for expected conditions.
- Validation lives in validators and reaches the caller as `Result.Invalid` through the pipeline; handlers never validate manually and never throw `ValidationException`.
- Endpoints map results with a solution-local `ToResponse` extension (Ok 200, NotFound 404, Invalid 400, Error 500) and never set status codes by hand.
- Unhandled exceptions go to global exception middleware placed first in the pipeline.
- A typed HTTP client throws its own `{ApiName}ApiException` carrying the status code; gRPC failures surface as `RpcException`, mapped by a server interceptor.

## Naming

- Files: `{Action}{Entity}Endpoint`, `{Action}{Entity}Query` or `Command`, `{Action}{Entity}{Query|Command}Handler`, `{Action}{Entity}{Query|Command}Validator`, `{Action}{Entity}Response`, `{Entity}Configuration`, `I{Entity}Repository`, `{Layer}Module`, `{Dependency}HealthCheck`.
- Routes are `/api/v{version}/{resource}` with kebab-case resources; admin actions sit under `/api/v1/admin/`.
- Cache keys are `{service}:{entity}:{identifier}`. Meters are `{Root}.{Service}`, counters `{domain}.{metric}.count`, histograms `{domain}.{metric}` with a lowercase unit.
- Strings default to `= string.Empty`, collections to `= []`. Namespaces are file-scoped.
- Connection strings use the keys `DefaultConnection`, `Redis` and `ServiceBus`; typed options classes expose a `SectionName` constant. Existing configuration keys are never renamed.

## Testing

- xUnit v3, one test project per layer (`{Root}.{Service}.{Layer}.Tests`) plus `{Root}.{Service}.AcceptanceTests`.
- Method names are `{Method}_When{Condition}_{ExpectedResult}`; the system under test is `_sut`. Arrange-Act-Assert, async tests, one concept per test.
- Use `TestContext.Current.CancellationToken` and `NullLogger<T>.Instance`.
- Handler and validator tests in Application.Tests. Repository tests use EF Core in-memory with a unique database name per test.
- Acceptance tests are Reqnroll features in `Features/` with one `[Binding]` step class per feature in `Steps/`, hosted by `WebApplicationFactory<Program>`, with Testcontainers SQL Server reset by Respawn and the MassTransit test harness.
- A test project uses exactly one mocking approach; never introduce a second.

## Gate

- build: dotnet build
- test: dotnet test
- format: dotnet format whitespace --verify-no-changes

## Open choices

- api-style: fast-endpoints, controllers, minimal-api (default fast-endpoints)
- cqrs: mediatr, none (default mediatr)
- constructor-style: primary, traditional (default primary)
- mapping: manual, automapper (default manual)
- caching: fusioncache, redis-raw, distributed-cache (default fusioncache)
- ef-provider: sqlserver, postgres, mysql, sqlite, cosmos (default sqlserver)
- mocking: nsubstitute, fakes, moq (default nsubstitute)
- mocking-style: plain, autofixture (default plain)
- test-class-naming: tests-suffix, should-suffix (default tests-suffix)
- source-root: src, repo-root (default src)

## Concerns

- architecture (always-on): any change to C# code, project references, DI modules or `Program.cs`
- endpoints (on-demand): adding or changing an HTTP endpoint or controller action, its request, response and route, or a gRPC service
- persistence (on-demand): entities, EF configurations, repositories, migrations or DbContext changes
- messaging (on-demand): event contracts, publishers, consumers or bus configuration
- background-jobs (on-demand): Hangfire jobs, recurring job registration or distributed locks
- caching (on-demand): cache reads, writes, keys, warming or invalidation
- integrations (on-demand): typed HTTP clients, gRPC clients, their options, resilience and health checks
- testing (on-demand): writing or changing unit or acceptance tests
