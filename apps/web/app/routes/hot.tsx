// 旧的“实时热度”事件榜已经换成论文热度榜（heat 模块的 /hot/papers）。
// 服务端对 /hot 有 301；客户端导航不经过服务端重定向，所以这里也要转一次，
// 否则点侧栏“热点榜”会渲染成旧的空白页，只有刷新才落到新页面。
import { redirect } from "react-router";

export async function loader() {
  throw redirect("/hot/papers");
}
