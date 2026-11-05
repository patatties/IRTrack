import type { Repositories } from "./ports";
import { apiRepositories } from "./api/adapter";

/** The single place where the data adapter is selected: the IRTrack REST API (server/). */
export function repos(): Repositories {
  return apiRepositories;
}
export type { Repositories, SystemInfo } from "./ports";
