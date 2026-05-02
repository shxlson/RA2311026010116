const BASE_URL = process.env.BASE_URL ?? "http://20.207.122.201/evaluation-service";

const requiredEnv = [
  "EMAIL",
  "NAME",
  "ROLLNO",
  "ACCESS_CODE",
  "CLIENT_ID",
  "CLIENT_SECRET"
];

const readEnv = () => {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`missing env: ${missing.join(", ")}`);
  }

  return {
    email: process.env.EMAIL,
    name: process.env.NAME,
    rollNo: process.env.ROLLNO,
    accessCode: process.env.ACCESS_CODE,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET
  };
};

const getToken = async () => {
  const creds = readEnv();
  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: creds.email,
      name: creds.name,
      rollNo: creds.rollNo,
      accessCode: creds.accessCode,
      clientID: creds.clientId,
      clientSecret: creds.clientSecret
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const token = data.access_token ?? data.token;
  if (!token) {
    throw new Error("auth response missing token");
  }

  return token;
};

const fetchNotifications = async (token) => {
  const res = await fetch(`${BASE_URL}/notifications`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`notifications failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return Array.isArray(data.notifications) ? data.notifications : [];
};

const typeWeight = (type) => {
  const key = String(type || "").toLowerCase();
  if (key === "placement") return 3;
  if (key === "result") return 2;
  if (key === "event") return 1;
  return 0;
};

const scoreNotification = (item, nowMs) => {
  const weight = typeWeight(item.Type ?? item.type);
  const ts = new Date(item.Timestamp ?? item.timestamp).getTime();
  const ageMinutes = Number.isFinite(ts) ? (nowMs - ts) / 60000 : 1e9;
  return weight * 1000000 - ageMinutes;
};

const pickTop10 = (items) => {
  const nowMs = Date.now();
  const scored = items.map((item) => ({
    item,
    score: scoreNotification(item, nowMs)
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10);
};

const formatRow = (rank, entry) => {
  const item = entry.item;
  const id = item.ID ?? item.id ?? "-";
  const type = item.Type ?? item.type ?? "-";
  const msg = item.Message ?? item.message ?? "-";
  const ts = item.Timestamp ?? item.timestamp ?? "-";
  return `${rank}. [${type}] ${msg} (${ts}) id=${id}`;
};

const main = async () => {
  const token = await getToken();
  const notifications = await fetchNotifications(token);

  const top = pickTop10(notifications);
  console.log("Top 10 priority notifications:");
  top.forEach((entry, idx) => {
    console.log(formatRow(idx + 1, entry));
  });
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
