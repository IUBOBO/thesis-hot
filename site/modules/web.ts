// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import { journalsWeb } from "@aihot/journals/web";
import { heatWeb } from "@aihot/heat/web";
import { accountsWeb } from "@aihot/accounts/web";

export const WEB_MODULES: readonly WebModule[] = [journalsWeb, heatWeb, accountsWeb];
