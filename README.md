# Messenger Clone App

A full-stack, real-time messaging application built with Next.js 15, React, TailwindCSS, MongoDB, Prisma, and Pusher.

## 🚀 Technology Stack

- **Frontend & Framework**: [Next.js 15 (App Router)](https://nextjs.org/) + [React](https://react.dev/)
- **Styling**: [TailwindCSS](https://tailwindcss.com/)
- **Database**: [MongoDB](https://www.mongodb.com/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Authentication**: [NextAuth.js](https://next-auth.js.org/) (Email/Password + OAuth Providers)
- **Real-time WebSockets**: [Pusher](https://pusher.com/)

---

## 🏗️ Architecture & Folder Structure

The application follows a standard Next.js App Router structure with modularized components, API routes, and server actions.

```text
messenger-app/
├── app/
│   ├── actions/          # Server-side actions for database fetching (e.g., getConversations, getCurrentUser)
│   ├── api/              # API Route Handlers (REST endpoints)
│   │   ├── auth/         # NextAuth endpoint
│   │   ├── conversations/# Create conversations, group chats, updating seen status
│   │   ├── messages/     # Creating new messages and triggering Pusher events
│   │   ├── pusher/       # Pusher Presence Channel authentication endpoint
│   │   └── register/     # User manual registration endpoint
│   ├── components/       # Reusable global UI components (Avatar, Button, Input, Modal, etc.)
│   ├── context/          # React Context providers (Toaster context, Auth context)
│   ├── hooks/            # Custom React hooks (useConversation, useOtherUser, useRoutes)
│   ├── libs/             # Core configurations (Prisma client singleton, Pusher instances)
│   ├── types/            # Global TypeScript interface definitions
│   │
│   ├── (site)/           # Auth/Login page routes
│   │
│   ├── conversations/    # The main "Chat" module pages
│   │   ├── [conversationId]/ # Dynamic route for individual open chats (renders Header, Body, Form)
│   │   ├── components/   # Chat-specific components (ConversationList, GroupChatModal, ConversationBox)
│   │   └── layout.tsx    # Renders the sidebar holding the ConversationList and Active Status
│   │
│   └── users/            # The "People" module listing available users to start chats with
│
└── prisma/
    └── schema.prisma     # MongoDB models and relationships definition
```

---

## ⚙️ Core Workflows

### 1. Authentication Status

We use **NextAuth.js** for handling session state.

- Users can log in manually (handled by `app/api/register` generating bcrypt hashes and checking via NextAuth's `CredentialsProvider`) or with Social logins (GitHub, Google).
- Upon navigating to any protected page (`/users` or `/conversations`), the application pulls the active session securely via Server Components.
- The `getCurrentUser()` server action retrieves the user details securely from the database to inject into the API scope or UI components.

### 2. Real-Time Communication Workflow (Pusher)

Pusher provides websockets to instantly push data from the database to clients. This prevents users from having to "refresh" the page to see new messages.

- **Frontend Connection (`pusherClient`)**:
  Located in `app/libs/pusher.ts`. Components like `ConversationList.tsx` and `Body.tsx` subscribe to unique "Channels" (e.g., their own email channel or a specific `conversationId` channel). When an event occurs, it intercepts the `message:new` or `conversation:update` websocket and triggers a React state update using `setMessages()`.
- **Backend Dispatching (`pusherServer`)**:
  When a user invokes an action (e.g., submitting a message), the POST request hits `api/messages/route.ts`.
  - Prisma inserts the message into MongoDB.
  - Immediately after, `pusherServer.trigger()` fires on the backend, targeting the `conversationId` channel, sending the new database object directly to the connected clients.

### 3. "Seen" Receipts Mechanism

- When a user enters a chat (`app/conversations/[conversationId]/page.tsx`), the `Body.tsx` component mounts.
- A `useEffect` automatically triggers a POST request to `/api/conversations/[conversationId]/seen`.
- The Route Handler checks the last message in that specific conversation. If the current user hasn't seen it, it uses `$addToSet` via Prisma to append their `userId` to the `seenIds` array on that `Message` model.
- It then triggers a `message:update` Pusher event down the pipeline, causing the other user's screen to instantly render your tiny avatar confirming you have read the message.

---

## 🔑 Key Concepts & Highlights

### Database Relationship Definitions

The core data relationships in `schema.prisma` rely on interconnected arrays referencing standard ObjectIDs (`@db.ObjectId`).

- `Conversation` > `userIds`: Tracks who participates in a chat room. (Allows group chats of `length > 2`).
- `Message` > `seenIds`: Tracks which specific users have read that specific message.
- `Message` > `senderId`: Associates the message directly with a User model reference.

### Hydrated Type Overrides

Prisma auto-generates types, but Next.js requires precise definitions when populating relational fields via `include: { ... }`.
In `app/types/index.ts`, custom types like `FullMessageType` and `FullConversationType` extend the base Prisma models, overriding the scalar references with the fully realized nested object properties (e.g., turning `userId` string arrays into populated `User[]` arrays).

### Optimistic UI

For the `GroupChatModal`, we process the form state using `react-hook-form` and overlay generic flexible components like `<Modal />` and `<Select />`. The forms manage active submission states (`isLoading`) to disable inputs instantly providing better UX before resolving network callbacks.
