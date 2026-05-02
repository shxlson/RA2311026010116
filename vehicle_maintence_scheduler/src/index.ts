import { writeFile } from "node:fs/promises";
import type {
  AuthResponse,
  Depot,
  DepotResponse,
  SelectionResult,
  VehicleTask,
  VehiclesResponse
} from "./types.js";

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
    email: process.env.EMAIL as string,
    name: process.env.NAME as string,
    rollNo: process.env.ROLLNO as string,
    accessCode: process.env.ACCESS_CODE as string,
    clientId: process.env.CLIENT_ID as string,
    clientSecret: process.env.CLIENT_SECRET as string
  };
};

const auth = async (): Promise<string> => {
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

  const data = (await res.json()) as AuthResponse;
  const token = data.access_token ?? data.token;
  if (!token) {
    throw new Error("auth response missing token");
  }

  return token;
};

const fetchJson = async <T>(url: string, token: string): Promise<T> => {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`request failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
};

const selectTasks = (vehicles: VehicleTask[], maxHours: number) => {
  const best = Array(maxHours + 1).fill(0);
  const choose = Array(maxHours + 1).fill(-1);
  const prev = Array(maxHours + 1).fill(-1);

  for (let i = 0; i < vehicles.length; i += 1) {
    const duration = vehicles[i].Duration;
    const impact = vehicles[i].Impact;

    for (let h = maxHours; h >= duration; h -= 1) {
      const candidate = best[h - duration] + impact;
      if (candidate > best[h]) {
        best[h] = candidate;
        choose[h] = i;
        prev[h] = h - duration;
      }
    }
  }

  let end = 0;
  for (let h = 1; h <= maxHours; h += 1) {
    if (best[h] > best[end]) {
      end = h;
    }
  }

  const picked: VehicleTask[] = [];
  let cursor = end;
  const seen = new Set<number>();

  while (cursor >= 0 && choose[cursor] !== -1) {
    const idx = choose[cursor];
    if (seen.has(idx)) {
      break;
    }

    picked.push(vehicles[idx]);
    seen.add(idx);
    cursor = prev[cursor];
  }

  const totalImpact = picked.reduce((sum, task) => sum + task.Impact, 0);
  const totalDuration = picked.reduce((sum, task) => sum + task.Duration, 0);

  return { tasks: picked, totalImpact, totalDuration };
};

const buildSchedule = (depots: Depot[], vehicles: VehicleTask[]): SelectionResult[] => {
  return depots.map((depot) => {
    const { tasks, totalImpact, totalDuration } = selectTasks(
      vehicles,
      depot.MechanicHours
    );

    return {
      depotId: depot.ID,
      mechanicHours: depot.MechanicHours,
      totalImpact,
      totalDuration,
      taskIds: tasks.map((task) => task.TaskID),
      tasks
    };
  });
};

const main = async () => {
  const token = await auth();
  const depots = await fetchJson<DepotResponse>(`${BASE_URL}/depots`, token);
  const vehicles = await fetchJson<VehiclesResponse>(`${BASE_URL}/vehicles`, token);

  const schedule = buildSchedule(depots.depots, vehicles.vehicles);
  const output = {
    generatedAt: new Date().toISOString(),
    depots: schedule
  };

  await writeFile("output.json", JSON.stringify(output, null, 2));
  console.log("wrote output.json");
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
