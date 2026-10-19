// The backend of the site's modules, installed by the api and the worker when they start (site/modules/index.ts).
import type { ServerModule } from "@aihot/backend/modules";
import journals from "@aihot/journals/server";
import heat from "@aihot/heat/server";
import accounts from "@aihot/accounts/server";

export const SERVER_MODULES: readonly ServerModule[] = [journals, heat, accounts];
