// 期刊模块的地址：期刊目录、单刊页，以及由接口进程回答的接口与按刊 RSS。
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "journals",
  pages: [
    { path: "journals", file: "web/Journals.tsx" },
    { path: "journal/:issn", file: "web/Journal.tsx" },
  ],
  apiPaths: [/^\/api\/journal(?:\/|$)/, /^\/feed\/journal\//],
});
