export type AuthResponse = {
  access_token?: string;
  token?: string;
  expires_in?: number;
};

export type Depot = {
  ID: number;
  MechanicHours: number;
};

export type DepotResponse = {
  depots: Depot[];
};

export type VehicleTask = {
  TaskID: string;
  Duration: number;
  Impact: number;
};

export type VehiclesResponse = {
  vehicles: VehicleTask[];
};

export type SelectionResult = {
  depotId: number;
  mechanicHours: number;
  totalImpact: number;
  totalDuration: number;
  taskIds: string[];
  tasks: VehicleTask[];
};
