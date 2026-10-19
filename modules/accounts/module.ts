// 读者账号模块的地址：登录、注册、我的账号。接口由接口进程回答，页面在 web/ 里。
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "accounts",
  pages: [
    { path: "login", file: "web/Login.tsx" },
    { path: "register", file: "web/Register.tsx" },
    { path: "recover", file: "web/Recover.tsx" },
    { path: "account", file: "web/Account.tsx" },
    { path: "subscriptions", file: "web/Subscriptions.tsx" },
  ],
  apiPaths: [/^\/api\/account(?:\/|$)/, /^\/feed\/search\//],
});
