import type { User } from "@/domain/types";

/**
 * The acting user. There is no login yet, so everyone acts as this user; its name is sent to
 * the API (X-IRTrack-Actor) and recorded in the audit trail. Replace when authentication arrives.
 */
const DEFAULT_USER: User = {
  id: "u-admin",
  name: "Administrator",
  email: "",
  team: "Incident Management",
  role: "Administrator",
};

let actor: User = DEFAULT_USER;
export const currentActor = () => actor;
export const setActor = (u: User) => {
  actor = u;
};
