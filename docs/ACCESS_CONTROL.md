# 会话与消息访问控制规则

所有「会话 / 消息 / 已读回执 / 实时频道」相关的读取与写入，统一收敛到
`app/actions/conversationAccess.ts`。本文是唯一的规则说明，每个入口的鉴权结论
都能从同一条规则推导出来。

## 唯一的规则

> **已认证用户只能访问 `conversation.userIds` 中包含自身 `user.id` 的会话。**

- 单聊（`isGroup` 为空/false）与群聊（`isGroup` 为 true）**不做任何区分**，
  「是否成员」是唯一判定依据。
- 「会话不存在」与「会话存在但当前用户不是成员」对外结论一致（`notAllowed`），
  不通过状态差异泄露会话是否存在。
- 成员判定只认数据库里的 `userIds`，不信任请求体中由客户端传入的任何归属字段。

三种结论与 HTTP 映射（路由侧）：

| 结论              | 含义                       | HTTP |
| ----------------- | -------------------------- | ---- |
| `unauthenticated` | 未登录 / 会话无效          | 401  |
| `notAllowed`      | 会话不存在，或不是其成员   | 403  |
| `authenticated`   | 已登录且是成员，放行       | —    |

页面数据入口（Server Component action）不抛 401/403，而是沿用既有页面行为：
无权访问时会话返回 `null`、列表返回 `[]`，由页面渲染 `EmptyState`。

## 共享原语

- `authorizeConversationAccess(id, include)`：路由用。一次查询同时完成
  「取当前用户 + 校验成员身份 + 取会话数据」，返回三态判别联合。
- `findAccessibleConversation(id, include)`：页面数据用。无权访问返回 `null`。
- `authorizePusherChannel(channel)`：实时频道用，复用同一条成员规则。
- `accessDeniedResponse(reason)`：把拒绝结论映射为 401/403。
- `conversationUsersInclude` / `conversationSeenInclude` /
  `messageSenderAndSeenInclude`：集中维护 include 形状，保证返回结构不变。

## 每个入口的鉴权结论

| 入口 | 处理者 | 规则应用 | 结论 |
| --- | --- | --- | --- |
| 会话列表（侧边栏） | `app/actions/getConversations.ts` | 仅查 `userIds has 当前用户` | 未登录→`[]`；否则只含本人参与的会话 |
| 会话详情页（单聊/群聊） | `app/actions/getConversationById.ts` → `findAccessibleConversation` | 必须是成员 | 非成员/不存在→`null`，页面显示 `EmptyState` |
| 消息列表 | `app/actions/getMessages.ts` → `findAccessibleConversation` | 必须是成员 | 非成员→`[]`（原先无任何鉴权） |
| 发送消息 | `POST /api/messages` | 必须是目标会话成员 | 未登录→401；非成员/会话不存在→403 |
| 已读回执 | `POST /api/conversations/[id]/seen` | 必须是成员（授权查询即带回会话数据） | 未登录→401；非成员/不存在→403 |
| 实时频道订阅 | `POST /api/pusher/auth` | 个人频道=本人 email；会话频道=成员 | 未登录→401；他人个人频道 / 非成员会话频道→403 |
| 新建会话 | `POST /api/conversations` | 仅要求已认证（创建本身把本人加入 `userIds`） | 未登录→401 |

## 兼容性

- 页面行为不变：无权访问仍是空态（`EmptyState`）/空列表。
- 接口返回结构不变：成功响应体、消息/会话的 include 字段保持原样；
  Pusher 事件（`messages:new`、`message:update`、`conversation:update`）
  的频道名与负载均未改动。
- 唯一收紧之处是把原先缺失/不一致的成员校验补齐（消息列表读取、发送消息、
  已读回执、Pusher 会话频道订阅），对正常参与会话的用户无影响。
