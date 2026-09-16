import PusherServer from "pusher";
import PusherClient from "pusher-js";

const pusherConfigured = Boolean(
  process.env.PUSHER_APP_ID &&
    process.env.PUSHER_SECRET &&
    process.env.NEXT_PUBLIC_PUSHER_APP_KEY
);

const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap2";

export const pusherServer = pusherConfigured
  ? new PusherServer({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.NEXT_PUBLIC_PUSHER_APP_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster,
      useTLS: true,
    })
  : ({
      trigger: async () => undefined,
      triggerBatch: async () => undefined,
      authorizeChannel: () => ({ auth: "" }),
    } as unknown as PusherServer);

const noopChannel = { bind: () => {}, unbind: () => {} };

export const pusherClient = pusherConfigured
  ? new PusherClient(process.env.NEXT_PUBLIC_PUSHER_APP_KEY!, {
      channelAuthorization: {
        endpoint: "/api/pusher/auth",
        transport: "ajax",
      },
      cluster,
    })
  : ({
      subscribe: () => noopChannel,
      unsubscribe: () => {},
      bind: () => {},
      unbind: () => {},
    } as unknown as PusherClient);
