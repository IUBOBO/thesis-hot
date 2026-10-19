# 本机运行（Windows，数据库在 D 盘）

这台机器上的 PostgreSQL 是**便携版**，装在 `D:\pg`，不占 C 盘、不需要管理员权限、也没有注册成服务。
**重启电脑后要手动启动一次。**

## 启动数据库

```powershell
D:\pg\pgsql\bin\pg_ctl.exe -D D:\pg\data -l D:\pg\pg.log -o "-p 5432" start
```

看到 `server started` 就好了；端口是 5432，用户 `postgres`，本地免密码（trust）。

停止：

```powershell
D:\pg\pgsql\bin\pg_ctl.exe -D D:\pg\data stop
```

日志：`D:\pg\pg.log`

## 启动站点

三个终端，都在 `E:\Agent\thesis-hot`：

```powershell
npm run dev:api      # 接口，3001
npm run dev:web      # 网页，3100
npm run dev:worker   # 抓取与模型任务（需要模型 key 时才开）
```

打开 <http://localhost:3100>，后台 <http://localhost:3100/admin>。
管理员密码在 `.env` 的 `ADMIN_PASSWORD`。

## 抓期刊（遥感、石油）

RSS 只覆盖 Nature 和 arXiv，Elsevier 系的期刊走独立脚本：

```powershell
npm run journals                    # 默认最近 45 天，清单里的全部期刊
npm run journals -- --days=7        # 只补最近 7 天
npm run journals -- --max=10       # 每本刊最多取 10 篇，控制费用
npm run journals -- --issn=0034-4257,0162-8828 --dry   # 只看这两本抓到什么，不入库
```

期刊清单在 `industry/journals.json`，加刊只要加一行 ISSN。默认 45 天是为了覆盖 IEEE 等按整期上线的刊；
已经入库的条目不会重复分析，只会多几次查询。
脚本用 OpenAlex（免费），填了 `OPENALEX_KEY` 额度更高；再填 `OPENALEX_MAILTO`（联系邮箱）可进礼貌池优先队列。

更新计划：worker 常驻时每天 07:30 / 17:30 抓期刊（45 天窗口、每刊最多 10 篇）、08:30 抓会议；arXiv 每 120 分钟。
手动跑仍然可以：

```powershell
npm run journals; npm run dev:worker
```

## 现在缺什么

`.env` 里这两行现在是 `false`，因为还没有模型 key：

```
COLLECT_ENABLED=false
MODEL_CALLS_ENABLED=false
```

拿到 key 后：

1. 把 `LLM_API_KEY` 填进 `.env`
2. 上面两行改成 `true`
3. 重启 api 和 worker

没有 key 时站点能打开、能翻页，但不会抓新论文（抓进来也没人写中文精读）。

## 数据库里的东西

- 库名 `myhot`（测试用 `myhot_test`）
- 已经跑过 60 个迁移，导入 12 个信源
- 重建数据库：

```powershell
node scripts/local-mkdb.mjs "postgres://postgres@127.0.0.1:5432/postgres"
npm run db:migrate
node --env-file=.env scripts/seed.ts
```

