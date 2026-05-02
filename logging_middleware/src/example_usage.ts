import { createLogger } from "./index.js";

const logger = createLogger({
  email: process.env.LOG_EMAIL ?? "",
  name: process.env.LOG_NAME ?? "",
  rollNo: process.env.LOG_ROLLNO ?? "",
  accessCode: process.env.LOG_ACCESS_CODE ?? "",
  clientId: process.env.LOG_CLIENT_ID ?? "",
  clientSecret: process.env.LOG_CLIENT_SECRET ?? ""
});

await logger.log(
  "backend",
  "error",
  "handler",
  "received string, expected bool"
);
