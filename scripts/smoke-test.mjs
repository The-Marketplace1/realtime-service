const baseUrl =
  process.env.REALTIME_BASE_URL ??
  `http://127.0.0.1:${process.env.PORT ?? "5000"}/realtime`;

for (const endpoint of ["/health", "/ready", "/metrics"]) {
  const response = await fetch(`${baseUrl}${endpoint}`);
  if (!response.ok) {
    throw new Error(`${endpoint} returned HTTP ${response.status}`);
  }

  const body = await response.json();
  if (endpoint === "/ready" && body.ready !== true) {
    throw new Error("/ready returned a non-ready response");
  }
  console.log(`${endpoint}: HTTP ${response.status}`);
}

