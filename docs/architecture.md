# Architecture and delivery guarantees

## Service boundary

The realtime service authenticates Socket.IO connections, authorizes room subscriptions, tracks transient presence, and relays events published by Marketplace services. It does not own users, bookings, payments, chat history, call routing, or other business state. Upstream services remain the source of truth.

Customer and professional mobile apps, plus the authorized admin dashboard, connect to this same service. Each socket gets a private user room; booking and conversation rooms require matching scopes from the established auth-service JWT. The apps own UI and interaction state, backend services own authoritative state, and this service owns transport only.

## Event path

1. An upstream service publishes a JSON event to one of the configured `marketplace:*:events` Redis channels.
2. The subscriber parses the envelope and normalizes supported legacy v1 events to the shared v2 contract.
3. The event is validated and the channel handler maps it to a Socket.IO event and emits it to the user's, booking's, conversation's, professional's, or private admin room.
4. Socket.IO's Redis adapter broadcasts room operations between service replicas.

The shared event-contract source required by the migration layer is vendored in `contracts/marketplace-event-contracts`. Keep this snapshot synchronized with the Marketplace shared event-contract package when event shapes change.

## Delivery semantics

Redis Pub/Sub is transient: it does not retain messages while this service is disconnected and cannot provide replay or durable acknowledgements. Socket.IO emits are best-effort unless a specific client protocol adds acknowledgements. The service does not claim exactly-once delivery, global ordering across independent publishers, or durable retries.

If a business event requires replay, deduplication, or guaranteed delivery, the owning service should publish through a durable stream/outbox and define the event ID and retry contract. This relay can then consume that contract without taking ownership of business state.

## Horizontal scaling and presence

All replicas must use the same Redis deployment. The Socket.IO Redis adapter shares room broadcasts; Redis-backed presence uses an atomic connection-slot operation so a user's connection limit is enforced across replicas. Presence expires after the service loses its heartbeat updates. Process-local health counters are local to each replica; aggregate them at the deployment's metrics layer.

## Security boundary

JWT verification is separate from token issuance. Production requires the auth service's verification key, Redis, and an explicit CORS origin allowlist. Booking and conversation room access is based on scoped IDs in the verified token; production tokens without the appropriate scope cannot subscribe. TLS should terminate at a trusted ingress or load balancer, with the service kept on a private network.

Admin-only operations are gated by the verified role claim. Never trust client-provided role or resource IDs without the corresponding token scope.

The service deliberately has no Marketplace PostgreSQL/PostGIS connection and no payment, booking, location-provider, map, phone, or chat-provider integration. It transports approved location, payment, booking, and communication events; the owning services decide what those events mean.

