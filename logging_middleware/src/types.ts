export type Stack = "backend" | "frontend";

export type Level = "debug" | "info" | "warn" | "error" | "fatal";

export type PackageName =
  | "cache"
  | "controller"
  | "cron_job"
  | "db"
  | "domain"
  | "handler"
  | "repository"
  | "route"
  | "service";

export type LogResult = {
  logID: string;
  message: string;
};

export type LoggerConfig = {
  baseUrl?: string;
  email: string;
  name: string;
  rollNo: string;
  accessCode: string;
  clientId: string;
  clientSecret: string;
  tokenCacheMs?: number;
};
